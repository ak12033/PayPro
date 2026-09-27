import crypto from 'crypto';
import config from '../config/env.js';

/**
 * Encryption at rest for identity data (plan.md §0.20.2 "Sensitive data
 * handling"): PAN numbers, bank account numbers, and the bytes of every KYC or
 * bank-proof document.
 *
 * AES-256-GCM, the same construction `totpService` uses for authenticator
 * secrets, under its own key (`PII_ENCRYPTION_KEY`). GCM authenticates as well
 * as encrypts, so a ciphertext edited in the database fails to decrypt rather
 * than decrypting to something else.
 *
 * Alongside the ciphertext, callers store:
 *   - a **masked** form (`XXXXX1234X`) — the only form any screen, log, audit
 *     entry or notification ever shows by default;
 *   - a **fingerprint** — a keyed HMAC of the normalised value, so "is this PAN
 *     already on another account?" can be answered with an index lookup and no
 *     decryption. Keyed, not a bare hash: a PAN has so little entropy that an
 *     unkeyed SHA-256 could be reversed by enumeration.
 */

/**
 * Read at call time, not import time, so a test that sets the env var before
 * a dynamic import sees it (the config-snapshot gotcha, context.md §9).
 */
const masterKey = () => {
    const configured = config.PII_ENCRYPTION_KEY;
    if (configured) {
        const key = /^[0-9a-f]{64}$/i.test(configured)
            ? Buffer.from(configured, 'hex')
            : Buffer.from(configured, 'base64');
        if (key.length !== 32) throw new Error('PII_ENCRYPTION_KEY must be 32 bytes (64 hex characters or base64)');
        return key;
    }
    // Development/test fallback. validateConfig makes the real key mandatory in production.
    return crypto.createHash('sha256').update(`pii-encryption:${config.JWT_SECRET || ''}`).digest();
};

/** Separate sub-keys for encryption and fingerprinting, so neither use weakens the other. */
const subKey = (purpose) => crypto.createHmac('sha256', masterKey()).update(purpose).digest();

/** A string → `v1:<iv>:<tag>:<ciphertext>` (base64url parts). */
export const encryptField = (plaintext) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', subKey('field'), iv);
    const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
    return ['v1', iv, cipher.getAuthTag(), ciphertext].map((part) => (typeof part === 'string' ? part : part.toString('base64url'))).join(':');
};

export const decryptField = (stored) => {
    const [version, iv, tag, ciphertext] = String(stored ?? '').split(':');
    if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('Unrecognised encrypted field format');
    const decipher = crypto.createDecipheriv('aes-256-gcm', subKey('field'), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
};

/** Bytes → `{ iv, tag, data }`, each a Buffer, for a document stored in Mongo. */
export const encryptBuffer = (buffer) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', subKey('document'), iv);
    const data = Buffer.concat([cipher.update(buffer), cipher.final()]);
    return { iv, tag: cipher.getAuthTag(), data };
};

export const decryptBuffer = ({ iv, tag, data }) => {
    const decipher = crypto.createDecipheriv('aes-256-gcm', subKey('document'), Buffer.from(iv));
    decipher.setAuthTag(Buffer.from(tag));
    return Buffer.concat([decipher.update(Buffer.from(data)), decipher.final()]);
};

/**
 * Keyed fingerprint of a normalised identifier. `kind` is part of the input so
 * the same digits as a PAN and as an account number never share a fingerprint.
 */
export const fingerprint = (kind, value) =>
    crypto.createHmac('sha256', subKey('fingerprint')).update(`${kind}:${value}`).digest('hex');

/** Show only the last `visible` characters: `maskTail('123456789012', 4)` → `XXXXXXXX9012`. */
export const maskTail = (value, visible = 4) => {
    const s = String(value ?? '');
    if (s.length <= visible) return 'X'.repeat(s.length);
    return 'X'.repeat(s.length - visible) + s.slice(-visible);
};

/**
 * PAN is `AAAAA9999A`. The masked form keeps the four digits and hides the
 * letters, which carry the holder's surname initial and entity type:
 * `ABCDE1234F` → `XXXXX1234X`.
 */
export const maskPan = (pan) => {
    const s = String(pan ?? '');
    return s.length === 10 ? `XXXXX${s.slice(5, 9)}X` : maskTail(s, 0);
};

export default { encryptField, decryptField, encryptBuffer, decryptBuffer, fingerprint, maskTail, maskPan };
