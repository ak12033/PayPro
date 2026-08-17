import Razorpay from 'razorpay';
import crypto from 'crypto';
import config from '../config/env.js';

export const razorpayInstance = new Razorpay({
    key_id: config.RAZORPAY_KEY_ID,
    key_secret: config.RAZORPAY_KEY_SECRET,
});

/**
 * Constant-time comparison of two hex digests.
 *
 * `a === b` on a signature short-circuits at the first differing byte, which
 * leaks how much of a forged signature was correct. `timingSafeEqual` requires
 * equal-length buffers, so length is checked separately.
 */
const safeEqualHex = (expected, provided) => {
    if (typeof provided !== 'string') return false;
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(provided, 'hex');
    if (a.length === 0 || a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
};

export const verifyRazorpaySignature = (orderId, paymentId, signature) => {
    const expected = crypto
        .createHmac('sha256', config.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');
    return safeEqualHex(expected, signature);
};

/**
 * Verify a Razorpay webhook.
 *
 * `rawBody` MUST be the exact bytes Razorpay sent (a Buffer from
 * `express.raw()`), never a re-serialised parsed object: JSON.stringify of a
 * parsed body reorders keys, drops the original whitespace, and re-encodes
 * unicode and numbers, so its HMAC will not match the one computed over the
 * bytes on the wire.
 */
export const verifyWebhookSignature = (rawBody, signature, secret) => {
    if (!secret || !signature) return false;

    const payload = Buffer.isBuffer(rawBody)
        ? rawBody
        : Buffer.from(typeof rawBody === 'string' ? rawBody : '', 'utf8');

    if (payload.length === 0) return false;

    const expected = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

    return safeEqualHex(expected, signature);
};
