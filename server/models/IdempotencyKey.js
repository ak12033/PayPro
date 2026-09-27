import mongoose from 'mongoose';

/**
 * Claims a client-supplied idempotency key *before* any money moves.
 *
 * The transfer path previously pre-checked for an existing key and wrote it
 * only after settlement, in a fire-and-forget `.catch(() => {})`. Two requests
 * carrying the same key that arrived before either had settled both passed the
 * pre-check and both moved money — only the second key write failed, and that
 * failure was swallowed. This collection exists so the key is claimed
 * atomically, up front, via the unique index below.
 */
const idempotencyKeySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    key: { type: String, required: true },
    /** Which endpoint this key belongs to — the same key string must not let
     *  a transfer and a top-up collide with each other. */
    scope: { type: String, required: true },
    /** Hash of the request body, so a *different* payload replaying the same
     *  key is rejected rather than silently replaying the first response. */
    requestHash: { type: String, required: true },
    status: { type: String, enum: ['in_progress', 'completed', 'failed'], default: 'in_progress' },
    responseStatus: { type: Number },
    responseBody: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

idempotencyKeySchema.index({ userId: 1, scope: 1, key: 1 }, { unique: true });
// 24h TTL: long enough to cover any realistic retry window, short enough that
// this collection does not grow without bound.
idempotencyKeySchema.index({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

export default mongoose.model('IdempotencyKey', idempotencyKeySchema);
