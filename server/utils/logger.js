import config from '../config/env.js';
import { getRequestId, getRequestUserId } from '../middlewares/requestContext.js';
import { reportError } from './errorTracking.js';

/**
 * Minimal structured logger.
 *
 * Everything previously went through bare `console.log` / `console.error` with
 * free-form strings and emoji. That is unparseable by any log aggregator
 * (CloudWatch, Datadog, Loki), so in production there was no way to filter by
 * level, search by user, or alert on a specific event — you could only eyeball
 * a firehose.
 *
 * JSON lines in production, readable text in development.
 *
 * Pass a caught error as `err` (`logger.error('…', { err })`): the log line
 * gets its message and stack, and error tracking gets the real Error, so the
 * event groups by stack rather than by message text. Every `error`-level entry
 * is forwarded to error tracking (utils/errorTracking.js), which is a no-op
 * unless `SENTRY_DSN` is set.
 */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[process.env.LOG_LEVEL] ?? (config.NODE_ENV === 'production' ? LEVELS.info : LEVELS.debug);

/**
 * Keys whose values must never reach a log sink.
 *
 * Credentials and one-time codes were previously at real risk of being logged:
 * several handlers logged whole request bodies or error objects on failure.
 */
const REDACT = new Set([
    'password', 'currentPassword', 'newPassword', 'otp', 'otpHash', 'token',
    'accessToken', 'refreshToken', 'refreshTokenHash', 'authorization',
    'razorpay_signature', 'x-razorpay-signature', 'apiKey', 'secret',
    'fcmTokens', 'FIREBASE_SERVICE_ACCOUNT',
]);

const redact = (value, depth = 0) => {
    if (depth > 4 || value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));

    const out = {};
    for (const [key, val] of Object.entries(value)) {
        out[key] = REDACT.has(key) ? '[REDACTED]' : redact(val, depth + 1);
    }
    return out;
};

/** An Error in `meta.err` becomes plain, loggable fields. */
const serializeErr = (err) => (
    err instanceof Error
        ? { error: err.message, errorName: err.name, stack: err.stack }
        : { error: String(err) }
);

const emit = (level, message, meta = {}) => {
    const { err, ...rest } = meta ?? {};
    const requestId = getRequestId();
    const userId = getRequestUserId();

    // Forwarded regardless of the log threshold: LOG_LEVEL controls noise in
    // the log sink, not whether errors are tracked.
    if (level === 'error') {
        reportError({ message, err, context: redact(rest), requestId, userId });
    }

    if (LEVELS[level] < threshold) return;

    const entry = {
        level,
        time: new Date().toISOString(),
        message,
        requestId,
        userId,
        ...redact(rest),
        ...(err !== undefined && serializeErr(err)),
    };

    // Drop empty correlation fields so dev output stays readable.
    if (!entry.requestId) delete entry.requestId;
    if (!entry.userId) delete entry.userId;

    const stream = level === 'error' || level === 'warn' ? console.error : console.log;

    if (config.NODE_ENV === 'production') {
        stream(JSON.stringify(entry));
    } else {
        const { level: _l, time: _t, message: msg, ...rest } = entry;
        const extras = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
        stream(`[${level.toUpperCase()}] ${msg}${extras}`);
    }
};

export const logger = {
    debug: (message, meta) => emit('debug', message, meta),
    info: (message, meta) => emit('info', message, meta),
    warn: (message, meta) => emit('warn', message, meta),
    error: (message, meta) => emit('error', message, meta),
};

export default logger;
