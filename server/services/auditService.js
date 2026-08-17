import AuditLog from '../models/AuditLog.js';
import logger from '../utils/logger.js';
import { getRequestId } from '../middlewares/requestContext.js';

/**
 * Record a security- or money-relevant event.
 *
 * Deliberately fire-and-forget: an audit write must never fail the user's
 * request. A dropped audit row is logged loudly so the gap is visible.
 */
export const audit = (action, {
    userId = null,
    outcome = 'success',
    target = undefined,
    req = undefined,
    metadata = {},
} = {}) => {
    const doc = {
        userId,
        action,
        outcome,
        target,
        ip: req?.ip,
        userAgent: String(req?.headers?.['user-agent'] || '').slice(0, 300),
        requestId: req?.id ?? getRequestId(),
        metadata,
    };

    return AuditLog.create(doc).catch((err) => {
        logger.error('Failed to write audit log', { action, auditError: err.message });
        return null;
    });
};

/**
 * Read a user's own audit history — powers the "login history" and
 * "security center" views.
 */
export const getUserAuditLog = async (userId, { limit = 20, page = 1, actions } = {}) => {
    const query = { userId };
    if (actions?.length) query.action = { $in: actions };

    const [entries, total] = await Promise.all([
        AuditLog.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .select('action outcome ip userAgent createdAt metadata')
            .lean(),
        AuditLog.countDocuments(query),
    ]);

    return { entries, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) };
};
