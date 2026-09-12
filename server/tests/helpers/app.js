import express from 'express';
import cookieParser from 'cookie-parser';
import { requestContext } from '../../middlewares/requestContext.js';
import { errorHandler, notFoundHandler } from '../../middlewares/errorHandler.js';
import authRouter from '../../routes/authRoutes.js';
import userRoutes from '../../routes/userRoutes.js';
import transactionRouter from '../../routes/transactionRoutes.js';
import paymentRouter from '../../routes/paymentRoutes.js';
import securityRouter from '../../routes/securityRoutes.js';
import notificationRouter from '../../routes/notificationRoutes.js';
import analyticsRouter from '../../routes/analyticsRoutes.js';

/**
 * Builds the same middleware stack as server.js, minus the pieces that would
 * make tests slow or non-deterministic (Socket.IO, cron, compression, the
 * global rate limiter).
 *
 * The webhook raw-body mount is preserved exactly, because signature
 * verification depends on it and that ordering is itself a thing worth testing.
 */
export const buildTestApp = () => {
    const app = express();

    app.set('trust proxy', 1);
    app.use('/api/payments/webhook', express.raw({ type: '*/*', limit: '1mb' }));
    app.use(express.json({ limit: '100kb' }));
    app.use(cookieParser());
    app.use(requestContext);

    app.use('/api/auth', authRouter);
    app.use('/api/users', userRoutes);
    app.use('/api/transactions', transactionRouter);
    app.use('/api/payments', paymentRouter);
    app.use('/api/security', securityRouter);
    app.use('/api/notifications', notificationRouter);
    app.use('/api/analytics', analyticsRouter);

    app.use(notFoundHandler);
    app.use(errorHandler);

    return app;
};
