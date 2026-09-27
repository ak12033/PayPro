import crypto from 'crypto';

/**
 * RFC 6238 time-based one-time passwords (plan.md §31.2.4).
 *
 * Written here rather than pulled in as a dependency. It is short (HMAC-SHA1
 * over a big-endian counter, dynamic truncation, modulo 10^6), the algorithm is
 * frozen, and it is pinned to the RFC's own test vectors in `tests/totp.test.js`
 * — a wrong implementation fails those, rather than rendering codes that look
 * plausible and never match an authenticator app.
 *
 * Parameters are the ones every authenticator app defaults to: SHA-1, 6 digits,
 * 30-second steps. Changing any of them silently breaks Google Authenticator,
 * which ignores the `algorithm`/`digits`/`period` URI parameters.
 */

export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;
/** Steps either side of "now" that still verify: ±30s of clock skew. */
export const TOTP_WINDOW = 1;
/** 160 bits, the RFC 4226 recommended secret length for HMAC-SHA1. */
const SECRET_BYTES = 20;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const base32Encode = (buffer) => {
    let bits = 0;
    let value = 0;
    let output = '';
    for (const byte of buffer) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    return output;
};

export const base32Decode = (input) => {
    const clean = String(input).toUpperCase().replace(/[\s=-]/g, '');
    let bits = 0;
    let value = 0;
    const bytes = [];
    for (const char of clean) {
        const index = BASE32_ALPHABET.indexOf(char);
        if (index === -1) throw new Error('Invalid base32 character');
        value = (value << 5) | index;
        bits += 5;
        if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Buffer.from(bytes);
};

/** A fresh base32 secret, as shown to the user and encoded into the QR code. */
export const generateSecret = () => base32Encode(crypto.randomBytes(SECRET_BYTES));

/** RFC 4226 HOTP for one counter value. `secret` is base32. */
export const hotp = (secret, counter, { digits = TOTP_DIGITS } = {}) => {
    const key = base32Decode(secret);
    const message = Buffer.alloc(8);
    message.writeBigUInt64BE(BigInt(counter));
    const hmac = crypto.createHmac('sha1', key).update(message).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary = ((hmac[offset] & 0x7f) << 24)
        | (hmac[offset + 1] << 16)
        | (hmac[offset + 2] << 8)
        | hmac[offset + 3];
    return String(binary % (10 ** digits)).padStart(digits, '0');
};

export const stepAt = (timeMs = Date.now()) => Math.floor(timeMs / 1000 / TOTP_PERIOD_SECONDS);

export const totp = (secret, { timeMs = Date.now(), digits = TOTP_DIGITS } = {}) =>
    hotp(secret, stepAt(timeMs), { digits });

/**
 * Verify a code and return the time step it matched, or null.
 *
 * Returning the step (not a boolean) is what makes replay protection possible:
 * the caller stores it and refuses any later code at or before that step, so a
 * code read over someone's shoulder cannot be used a second time inside its
 * 90-second validity window.
 *
 * Every candidate in the window is compared, in constant time, whether or not
 * an earlier one matched, so timing does not reveal which step was right.
 */
export const verifyTotp = (secret, code, { timeMs = Date.now(), window = TOTP_WINDOW, afterStep = -1 } = {}) => {
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
    const current = stepAt(timeMs);
    let matched = null;
    for (let step = current - window; step <= current + window; step += 1) {
        const candidate = hotp(secret, step);
        const equal = crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(code));
        if (equal && step > afterStep && matched === null) matched = step;
    }
    return matched;
};

/**
 * The `otpauth://` URI an authenticator app reads from the QR code.
 * Issuer appears both as the label prefix and the parameter, which is what
 * makes older and newer apps both show "PayPro" rather than a bare email.
 */
export const otpauthUri = ({ secret, accountName, issuer = 'PayPro' }) => {
    const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`;
    const params = new URLSearchParams({
        secret,
        issuer,
        algorithm: 'SHA1',
        digits: String(TOTP_DIGITS),
        period: String(TOTP_PERIOD_SECONDS),
    });
    return `otpauth://totp/${label}?${params.toString()}`;
};

export default { generateSecret, hotp, totp, verifyTotp, otpauthUri, base32Encode, base32Decode, stepAt };
