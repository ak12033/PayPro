import crypto from 'crypto';
import config from '../config/env.js';

/**
 * Signed, short-lived payment codes for QR transfers (plan.md §9.3).
 *
 * The signature is the entire point. An unsigned `{uid}` payload would let
 * anyone generate a QR naming any account — print one, stick it over a real
 * merchant's code, and collect their payments. Because the code carries an
 * HMAC only this server can produce, a forged code naming an arbitrary user id
 * fails to resolve.
 *
 * What this is not: an authorisation. Scanning a code pre-fills a recipient,
 * nothing more — the sender still enters an amount and confirms, and the
 * transfer goes through the same limits, risk gate and 2FA as any other. A
 * payment code is an address, not a mandate.
 */

/** Five minutes. Long enough to scan across a table, short enough that a photographed code is useless later. */
export const PAYMENT_CODE_TTL_SECONDS = 300;

const VERSION = 1;

/**
 * Derived from JWT_SECRET rather than requiring a second configured key, the
 * same pattern `config/security.js` uses for the fingerprint pepper — secure by
 * default rather than secure only if someone remembers to set another variable.
 */
const signingKey = crypto
    .createHash('sha256')
    .update(`payment-code:${config.JWT_SECRET || ''}`)
    .digest();

const base64url = (buf) => Buffer.from(buf).toString('base64url');

const sign = (payload) =>
    base64url(crypto.createHmac('sha256', signingKey).update(payload).digest());

/**
 * `{v, uid, exp}` plus a signature, encoded as `<base64url payload>.<sig>`.
 * The client renders the whole string as a QR.
 */
export const issuePaymentCode = (userId, { now = Date.now() } = {}) => {
    const exp = Math.floor(now / 1000) + PAYMENT_CODE_TTL_SECONDS;
    const payload = base64url(JSON.stringify({ v: VERSION, uid: String(userId), exp }));
    return {
        code: `${payload}.${sign(payload)}`,
        expiresAt: new Date(exp * 1000),
        ttlSeconds: PAYMENT_CODE_TTL_SECONDS,
    };
};

/**
 * @returns {{ ok: true, userId: string } | { ok: false, error: string }}
 */
export const verifyPaymentCode = (code, { now = Date.now() } = {}) => {
    if (typeof code !== 'string' || code.length > 512) {
        return { ok: false, error: 'That payment code is not valid.' };
    }

    const [payload, signature] = code.split('.');
    if (!payload || !signature) return { ok: false, error: 'That payment code is not valid.' };

    const expected = sign(payload);
    /**
     * Length check first: `timingSafeEqual` throws on a length mismatch rather
     * than returning false, and an attacker controls the length.
     */
    if (signature.length !== expected.length) {
        return { ok: false, error: 'That payment code is not valid.' };
    }
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        return { ok: false, error: 'That payment code is not valid.' };
    }

    let decoded;
    try {
        decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
        return { ok: false, error: 'That payment code is not valid.' };
    }

    if (decoded.v !== VERSION) return { ok: false, error: 'That payment code is out of date.' };
    if (!decoded.uid || !/^[0-9a-fA-F]{24}$/.test(decoded.uid)) {
        return { ok: false, error: 'That payment code is not valid.' };
    }
    // Expiry is checked after the signature, so an expired-but-genuine code and
    // a forged one are still distinguishable to the user by their message.
    if (typeof decoded.exp !== 'number' || decoded.exp * 1000 < now) {
        return { ok: false, error: 'That payment code has expired. Ask for a fresh one.' };
    }

    return { ok: true, userId: decoded.uid };
};

export default { issuePaymentCode, verifyPaymentCode, PAYMENT_CODE_TTL_SECONDS };
