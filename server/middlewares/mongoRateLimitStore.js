import mongoose from 'mongoose';

/**
 * A shared rate-limit store backed by the database this project already runs,
 * rather than `express-rate-limit`'s default in-process Map.
 *
 * The default store keeps every counter in the memory of a single process.
 * `server/vercel.json` implies a serverless deployment where each invocation
 * can be a fresh process, and even a long-lived deployment usually runs more
 * than one replica behind a load balancer — either way, a memory store gives
 * each process its own counter, so the real limit is `configuredLimit ×
 * replicaCount`, not the number in the config. The login limiter (10 attempts
 * / 15 min) is the clearest case: across, say, four replicas an attacker gets
 * 40 attempts, not 10.
 *
 * A dedicated cache (Redis) is the conventional answer, but this stack has no
 * cache anywhere in it (see plan.md §2.1's "not present" list), and adding one
 * only for this would be a new piece of infrastructure to run and monitor for
 * a problem MongoDB — already a hard dependency of every replica — can solve
 * on its own. `rate-limit-mongo` on npm does the same thing; this is written
 * by hand instead, in keeping with this codebase's preference for a small
 * owned implementation over a dependency for something this size (the same
 * call made for `useQuery` and `riskEvaluationService`).
 *
 * One MongoStore instance belongs to exactly one `rateLimit()` call — express-
 * rate-limit calls `init(options)` once per limiter with that limiter's own
 * `windowMs`, so two limiters cannot share an instance. `prefix` namespaces
 * counters between limiters that might otherwise key on the same identifier
 * (e.g. two different limiters both keying on the same user id).
 */

const counterSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    count: { type: Number, required: true, default: 0 },
    resetAt: { type: Date, required: true },
});
// TTL sweep: a window nobody hits again is garbage-collected automatically
// rather than accumulating forever.
counterSchema.index({ resetAt: 1 }, { expireAfterSeconds: 0 });

let RateLimitCounter = null;
const getModel = () => {
    // Lazy + memoized: avoids "Cannot overwrite model" on a hot-reloading dev
    // server, and avoids registering the model at all for a process that
    // never actually enforces rate limits (e.g. most test runs).
    if (!RateLimitCounter) {
        RateLimitCounter = mongoose.models.RateLimitCounter
            ?? mongoose.model('RateLimitCounter', counterSchema);
    }
    return RateLimitCounter;
};

export class MongoStore {
    constructor({ prefix }) {
        this.prefix = prefix;
    }

    init(options) {
        this.windowMs = options.windowMs;
    }

    _key(key) {
        return `${this.prefix}:${key}`;
    }

    /**
     * Atomic fixed-window counter via a pipeline update: one round trip,
     * whether this is the first hit in a fresh window or the Nth hit in an
     * existing one — a read-then-write here is exactly the TOCTOU this
     * codebase's ledger goes out of its way to avoid elsewhere (see
     * ledgerService.js), and two concurrent requests racing a plain
     * findOne-then-save would both observe the same starting count.
     */
    async increment(key) {
        const now = new Date();
        const windowMs = this.windowMs;

        const doc = await getModel().findOneAndUpdate(
            { key: this._key(key) },
            [
                {
                    $set: {
                        resetAt: {
                            $cond: [{ $gt: ['$resetAt', now] }, '$resetAt', new Date(now.getTime() + windowMs)],
                        },
                        count: {
                            $cond: [{ $gt: ['$resetAt', now] }, { $add: ['$count', 1] }, 1],
                        },
                    },
                },
            ],
            { upsert: true, new: true }
        );

        return { totalHits: doc.count, resetTime: doc.resetAt };
    }

    async decrement(key) {
        // Used by `skipSuccessfulRequests`/`skipFailedRequests` to undo a hit
        // that shouldn't have counted. Best-effort: if the window already
        // expired and was swept, there is nothing left to correct.
        await getModel().updateOne({ key: this._key(key) }, { $inc: { count: -1 } });
    }

    async resetKey(key) {
        await getModel().deleteOne({ key: this._key(key) });
    }

    async get(key) {
        const doc = await getModel().findOne({ key: this._key(key), resetAt: { $gt: new Date() } }).lean();
        return doc ? { totalHits: doc.count, resetTime: doc.resetAt } : undefined;
    }
}

export const mongoStore = (prefix) => new MongoStore({ prefix });
