import config from '../config/env.js';
import { LedgerError } from '../services/ledgerService.js';
import { DomainError } from '../utils/domainError.js';
import logger from '../utils/logger.js';

/**
 * Terminal error handler.
 *
 * Controllers previously ended with `res.status(500).json({ message: err.message })`,
 * which forwarded raw internals to the client — Mongoose validation paths,
 * duplicate-key details including the offending value, and driver messages that
 * disclose collection names and connection topology. It also meant every thrown
 * error produced a 500 even when the real cause was a 400.
 */
export const notFoundHandler = (req, res) => {
    res.status(404).json({
        message: `Route not found: ${req.method} ${req.originalUrl}`,
        requestId: req.id,
    });
};

/**
 * Whether the handler below will answer with a 4xx. A client error is the
 * caller's mistake, not a defect: it is logged at `warn` and never reaches error
 * tracking, which would otherwise fill with every failed validation.
 */
const isClientError = (err) =>
    err instanceof LedgerError
    || err instanceof DomainError
    || err?.name === 'ValidationError'
    || err?.name === 'CastError'
    || err?.code === 11000
    || err?.type === 'entity.too.large'
    || err?.type === 'entity.parse.failed'
    || err?.message === 'Not allowed by CORS'
    || (err?.status || err?.statusCode || 500) < 500;

// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity
export const errorHandler = (err, req, res, next) => {
    if (res.headersSent) return next(err);

    // Always log the full error server-side; never send it downstream. The
    // path only, not the query string, which can carry a searched email.
    const where = { method: req.method, url: req.originalUrl?.split('?')[0] };
    if (isClientError(err)) {
        logger.warn('Request rejected', { ...where, error: err.message });
    } else {
        logger.error('Request failed', { ...where, err });
    }

    if (err instanceof LedgerError || err instanceof DomainError) {
        return res.status(err.status).json({ message: err.message, code: err.code });
    }

    if (err?.name === 'ValidationError') {
        return res.status(400).json({
            message: 'Validation failed',
            errors: Object.keys(err.errors || {})
        });
    }

    if (err?.name === 'CastError') {
        return res.status(400).json({ message: 'Malformed identifier in request' });
    }

    if (err?.code === 11000) {
        return res.status(409).json({ message: 'That record already exists' });
    }

    if (err?.type === 'entity.too.large') {
        return res.status(413).json({ message: 'Request body too large' });
    }

    if (err?.type === 'entity.parse.failed') {
        return res.status(400).json({ message: 'Malformed JSON body' });
    }

    if (err?.message === 'Not allowed by CORS') {
        return res.status(403).json({ message: 'Origin not allowed' });
    }

    const status = err.status || err.statusCode || 500;

    res.status(status).json({
        message: status < 500
            ? (err.message || 'Request failed')
            : 'Something went wrong. Please try again.',
        // Echo the correlation id so a user can quote it to support and we can
        // find the exact request in the logs.
        requestId: req.id,
        // Stack traces only outside production.
        ...(config.NODE_ENV !== 'production' && { detail: err.message })
    });
};
