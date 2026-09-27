import crypto from 'crypto';
import IdempotencyKey from '../models/IdempotencyKey.js';
import { asString } from '../utils/sanitize.js';

/**
 * Claim an idempotency key before the handler does any work.
 *
 * `scope` namespaces the key so the same client-generated string can't collide
 * across unrelated endpoints (a transfer and a top-up started back-to-back
 * could otherwise legitimately reuse a key). The unique index on
 * `{userId, scope, key}` is what makes the claim atomic: exactly one concurrent
 * request wins the `create()` below, and every other caller — including two
 * requests that both raced in before either had written anything — is turned
 * away before touching the ledger.
 *
 * A request with no key at all is let through unchanged; idempotency is a
 * safety net for retries, not a requirement to call the route at all.
 */
export const idempotency = (scope) => async (req, res, next) => {
    const key =
        asString(req.headers['idempotency-key'], { maxLength: 100 }) ||
        asString(req.body?.idempotencyKey, { maxLength: 100 });

    if (!key || !req.user?.id) return next();

    const requestHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(req.body ?? {}))
        .digest('hex');

    let claim;
    try {
        claim = await IdempotencyKey.create({
            userId: req.user.id,
            scope,
            key,
            requestHash,
            status: 'in_progress',
        });
    } catch (err) {
        if (err?.code !== 11000) throw err;

        const existing = await IdempotencyKey.findOne({ userId: req.user.id, scope, key });
        if (!existing) return next(); // lost the race to a TTL sweep; treat as fresh

        if (existing.requestHash !== requestHash) {
            return res.status(409).json({
                message: 'This idempotency key was already used for a different request.',
            });
        }

        if (existing.status === 'in_progress') {
            return res.status(409).json({ message: 'This request is already being processed.' });
        }

        // A genuine retry of a request we already finished: replay the
        // original outcome rather than doing the work (and moving money) again.
        return res
            .status(existing.responseStatus || 200)
            .json(existing.responseBody ?? { message: 'Already processed' });
    }

    const finish = (status, body) => {
        // Round-trip through JSON first: a controller's response body often
        // embeds a live Mongoose document (methods, internal `$__` state,
        // circular parent references), which is not safe to hand to the
        // driver's BSON serialiser as-is. This produces exactly the plain
        // structure the client already received via `originalJson`, which is
        // also exactly what a future replay should send back.
        let plainBody;
        try {
            plainBody = JSON.parse(JSON.stringify(body));
        } catch {
            plainBody = { message: 'Request completed.' };
        }

        IdempotencyKey.updateOne(
            { _id: claim._id },
            { $set: { status: status < 400 ? 'completed' : 'failed', responseStatus: status, responseBody: plainBody } }
        ).catch(() => {});
    };

    const originalJson = res.json.bind(res);
    res.json = (body) => {
        finish(res.statusCode, body);
        return originalJson(body);
    };

    next();
};

export default idempotency;
