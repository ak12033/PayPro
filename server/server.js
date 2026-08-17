import express from 'express';
import 'dotenv/config';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import http from 'http';
import morgan from 'morgan';
import mongoose from 'mongoose';

import userRoutes from './routes/userRoutes.js';
import connectDB from './config/db.js';
import config, { validateConfig } from './config/env.js';
import authRouter from './routes/authRoutes.js';
import paymentRouter from './routes/paymentRoutes.js';
import transactionRouter from './routes/transactionRoutes.js';
import notificationRouter from './routes/notificationRoutes.js';
import aiRouter from './routes/aiRoutes.js';
import securityRouter from './routes/securityRoutes.js';
import { startCronJobs, stopCronJobs } from './utils/cron.js';
import { initSocket } from './utils/socket.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { globalLimiter } from './middlewares/rateLimiters.js';
import { requestContext } from './middlewares/requestContext.js';
import logger from './utils/logger.js';

// Refuse to boot with a broken configuration rather than failing later per request.
validateConfig();

const app = express();

await connectDB();

/**
 * Trust the reverse proxy (Vercel / nginx / Render).
 *
 * Without this, `req.ip` is the proxy's address rather than the client's, so
 * every rate limiter shares a single bucket across all users (one abuser locks
 * out everyone) and the login-location check sees a constant IP for everybody.
 */
app.set('trust proxy', 1);
app.disable('x-powered-by');

/**
 * Security headers. There were none previously.
 * CSP is left off because this API serves JSON only — the SPA is hosted
 * separately and sets its own policy.
 */
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(compression());

/**
 * CORS.
 *
 * CORS_ORIGIN now accepts a comma-separated allow-list, and unknown origins are
 * rejected explicitly. The previous single-value form silently fell back to
 * `http://localhost:5173` whenever the env var was unset — which in production
 * meant the deployed frontend was blocked while a local dev machine was not.
 */
const allowedOrigins = (config.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(cors({
    origin(origin, callback) {
        // Same-origin / server-to-server requests carry no Origin header.
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

/**
 * Razorpay webhook — MUST be mounted before express.json().
 *
 * Signature verification needs the exact bytes Razorpay sent. Once
 * express.json() has parsed the body, the original bytes are gone, and the old
 * code's `JSON.stringify(req.body)` reconstruction produced a different byte
 * string, so the HMAC never matched and every real webhook was rejected.
 */
app.use('/api/payments/webhook', express.raw({ type: '*/*', limit: '1mb' }));

// Explicit body size cap: the default is 100kb, but stating it makes the
// 413 path deliberate and keeps a large-payload DoS off the table.
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(cookieParser());

// Assign a correlation id before anything that might log.
app.use(requestContext);

/**
 * Access logs.
 *
 * In production these are emitted as JSON through the structured logger and
 * carry the request id, so an access line can be joined to the application
 * logs and error stacks produced by the same request. Health checks are
 * skipped — they would otherwise dominate the log volume.
 */
if (config.NODE_ENV === 'production') {
    app.use(morgan(
        (tokens, req, res) => JSON.stringify({
            method: tokens.method(req, res),
            url: tokens.url(req, res),
            status: Number(tokens.status(req, res)),
            durationMs: Number(tokens['response-time'](req, res)),
            ip: req.ip,
        }),
        {
            skip: (req) => req.path === '/health' || req.path === '/ready',
            stream: { write: (line) => logger.info('http_request', JSON.parse(line)) },
        }
    ));
} else {
    app.use(morgan('dev', { skip: (req) => req.path === '/health' || req.path === '/ready' }));
}

app.use('/api', globalLimiter);

app.get('/', (req, res) => res.send('💾 Server is up and running!'));

/**
 * Liveness: is the process up at all? Must stay cheap and must NOT depend on
 * the database, or a brief Mongo blip causes the orchestrator to kill and
 * restart otherwise-healthy containers in a loop.
 */
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

/**
 * Readiness: should this instance receive traffic? This one *does* check the
 * database, so a load balancer can drain an instance that has lost Mongo
 * instead of routing requests that are guaranteed to fail.
 */
app.get('/ready', (req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    res.status(dbUp ? 200 : 503).json({
        status: dbUp ? 'ready' : 'not_ready',
        database: dbUp ? 'connected' : 'disconnected',
        uptime: process.uptime(),
    });
});

app.use('/api/auth', authRouter);
app.use('/api/users', userRoutes);
app.use('/api/transactions', transactionRouter);
app.use('/api/payments', paymentRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/ai', aiRouter);
app.use('/api/security', securityRouter);

// Must come after all routes.
app.use(notFoundHandler);
app.use(errorHandler);

const server = http.createServer(app);
initSocket(server);

const PORT = config.PORT || 5000;
server.listen(PORT, () => {
    logger.info('Server started', { port: PORT, env: config.NODE_ENV });
    startCronJobs();
});

/**
 * Graceful shutdown.
 *
 * Without this, a deploy or a container restart severed in-flight requests
 * mid-write — including partially applied money movements.
 */
let shuttingDown = false;

const shutdown = async (signal) => {
    /**
     * Re-entrancy guard. A second SIGTERM, or an uncaughtException raised
     * *during* teardown, would otherwise start a second shutdown that races the
     * first — closing the Mongo connection twice and potentially exiting before
     * in-flight writes drain.
     */
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info('Shutting down gracefully', { signal });
    stopCronJobs();

    server.close(async () => {
        try {
            await mongoose.connection.close(false);
            logger.info('Connections closed, exiting');
            process.exit(0);
        } catch (err) {
            logger.error('Error during shutdown', { error: err.message });
            process.exit(1);
        }
    });

    // Don't hang forever on a stuck connection.
    setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
    }, 15000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

/**
 * An unhandled rejection previously terminated the Node process silently under
 * some conditions and left it in an undefined state under others. Log loudly;
 * the errorHandler catches the in-request cases.
 */
process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', {
        error: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
    });
});

process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    shutdown('uncaughtException');
});
