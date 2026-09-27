import crypto from 'crypto';
import WebhookEvent from '../models/WebhookEvent.js';

/** Deterministic id for a webhook delivery — see WebhookEvent.js for why. */
export const hashWebhookBody = (rawBody) =>
    crypto.createHash('sha256').update(rawBody).digest('hex');

/**
 * Record a webhook delivery and report whether it is a duplicate.
 *
 * Relies on the unique index on `{provider, eventId}` to make the check
 * atomic: two deliveries of the same event arriving concurrently both race
 * `create()`, exactly one wins, and the loser is told `duplicate: true`
 * rather than both proceeding to process the event a second time.
 */
export const recordWebhookEvent = async ({ provider = 'razorpay', eventId, eventType, payload, signatureValid }) => {
    try {
        const doc = await WebhookEvent.create({ provider, eventId, eventType, payload, signatureValid });
        return { duplicate: false, event: doc };
    } catch (err) {
        if (err?.code !== 11000) throw err;
        const existing = await WebhookEvent.findOne({ provider, eventId });
        return { duplicate: true, event: existing };
    }
};

export const markWebhookProcessed = (id) =>
    WebhookEvent.updateOne({ _id: id }, { $set: { status: 'processed', processedAt: new Date() } });

export const markWebhookFailed = (id, error) =>
    WebhookEvent.updateOne({ _id: id }, { $set: { status: 'failed', error: String(error).slice(0, 500) } });

export const markWebhookIgnored = (id) =>
    WebhookEvent.updateOne({ _id: id }, { $set: { status: 'ignored', processedAt: new Date() } });

/** Admin-facing listing, newest first, optionally filtered by status. */
export const listWebhookEvents = async ({ status, page = 1, limit = 25 } = {}) => {
    const query = status ? { status } : {};
    const [events, total] = await Promise.all([
        WebhookEvent.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        WebhookEvent.countDocuments(query),
    ]);
    return { events, total, currentPage: page, totalPages: Math.max(1, Math.ceil(total / limit)) };
};
