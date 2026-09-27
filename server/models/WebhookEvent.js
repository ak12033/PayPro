import mongoose from 'mongoose';

/**
 * Durable record of every inbound gateway webhook.
 *
 * Razorpay retries a webhook it doesn't get a 2xx for, and a slow instance or
 * a network blip can make that happen even after we *did* process the first
 * delivery. `handleWebhook`'s settlement paths (`settleCapturedOrder`,
 * `settleRefund`) are already idempotent via compare-and-set — a retried
 * event is a safe no-op — so this collection is not what makes retries safe.
 * It exists for what compare-and-set alone can't give you: a durable,
 * queryable record of "what did the gateway actually send us and when",
 * for observability (was an event ever delivered at all?) and for an admin
 * to replay a specific event without re-deriving it from Razorpay's logs.
 *
 * `eventId` is a hash of the raw request body rather than a field out of the
 * payload — Razorpay does not guarantee a stable top-level event id, but a
 * genuine retry of the same event resends byte-identical JSON, which hashes
 * identically. Two *different* events (even the same type, same order,
 * moments apart) produce different bytes and therefore different hashes, so
 * this never conflates two real events into one.
 */
const webhookEventSchema = new mongoose.Schema({
    provider: { type: String, default: 'razorpay' },
    eventId: { type: String, required: true },
    eventType: { type: String },
    signatureValid: { type: Boolean, required: true },
    payload: { type: mongoose.Schema.Types.Mixed },
    status: {
        type: String,
        enum: ['received', 'processed', 'failed', 'ignored'],
        default: 'received',
    },
    error: { type: String },
    processedAt: { type: Date },
    /** Operator replays from the console (plan.md §28.2). Absent until the first one. */
    replayCount: { type: Number },
    lastReplayedAt: { type: Date },
}, { timestamps: true });

webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
webhookEventSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('WebhookEvent', webhookEventSchema);
