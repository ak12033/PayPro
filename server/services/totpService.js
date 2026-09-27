import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Session from '../models/Session.js';
import config from '../config/env.js';
import { generateSecret, verifyTotp, otpauthUri, stepAt } from '../utils/totp.js';

/**
 * Authenticator-app second factor (plan.md §31.2.4).
 *
 * Owns enrolment, verification, recovery codes and the admin reset. Nothing
 * else reads `user.totp.secret` or `user.totp.recoveryCodes`.
 *
 * The recovery policy (decided 2026-09-22): ten one-time recovery codes shown
 * once at enrolment. A holder who has lost both the authenticator and the codes
 * asks support, and an admin "Reset 2FA" turns TOTP off. The account then falls
 * back to emailed codes, and the holder is emailed that it happened.
 */

export const RECOVERY_CODE_COUNT = 10;
/** A setup that is not confirmed within this long has to be restarted. */
export const PENDING_SETUP_TTL_MS = 15 * 60 * 1000;
export const STAFF_ROLES = ['support', 'risk', 'admin'];

export class TotpError extends Error {
    constructor(code, message, status = 400) {
        super(message);
        this.name = 'TotpError';
        this.code = code;
        this.status = status;
    }
}

// ---------------------------------------------------------------------------
// Secret encryption at rest
// ---------------------------------------------------------------------------

/**
 * Read at call time, not import time, so tests that set the env var before a
 * dynamic import see it (the config-snapshot gotcha, plan.md §0.4).
 */
const encryptionKey = () => {
    const configured = config.TOTP_ENCRYPTION_KEY;
    if (configured) {
        const key = /^[0-9a-f]{64}$/i.test(configured)
            ? Buffer.from(configured, 'hex')
            : Buffer.from(configured, 'base64');
        if (key.length !== 32) throw new Error('TOTP_ENCRYPTION_KEY must be 32 bytes (64 hex characters or base64)');
        return key;
    }
    // Development/test fallback. validateConfig makes the real key mandatory in production.
    return crypto.createHash('sha256').update(`totp-secret-encryption:${config.JWT_SECRET || ''}`).digest();
};

/** AES-256-GCM, stored as `v1:<iv>:<tag>:<ciphertext>` (base64url parts). */
export const encryptSecret = (plaintext) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', iv, tag, ciphertext].map((part) => (typeof part === 'string' ? part : part.toString('base64url'))).join(':');
};

export const decryptSecret = (stored) => {
    const [version, iv, tag, ciphertext] = String(stored).split(':');
    if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('Unrecognised TOTP secret format');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
};

// ---------------------------------------------------------------------------
// Recovery codes
// ---------------------------------------------------------------------------

// No 0/O/1/I/L, so a code read off paper cannot be mistyped into a different one.
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** `XXXXX-XXXXX`: 10 characters from a 31-letter alphabet, ~49 bits each. */
const mintRecoveryCode = () => {
    let raw = '';
    for (let i = 0; i < 10; i += 1) raw += RECOVERY_ALPHABET[crypto.randomInt(RECOVERY_ALPHABET.length)];
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
};

/** Case, spaces and the dash are all optional when typing one back. */
export const normaliseRecoveryCode = (code) => String(code ?? '').toUpperCase().replace(/[\s-]/g, '');

/**
 * SHA-256, not bcrypt: each code carries ~49 bits of randomness and the
 * endpoints that accept one are rate limited and attempt-bounded, so a slow
 * hash buys nothing, while bcrypt over ten codes would cost ~1s per sign-in.
 */
const hashRecoveryCode = (code) => crypto.createHash('sha256').update(`paypro-recovery:${normaliseRecoveryCode(code)}`).digest('hex');

const mintRecoveryCodes = () => {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, mintRecoveryCode);
    return { codes, stored: codes.map((code) => ({ hash: hashRecoveryCode(code), usedAt: null })) };
};

export const isRecoveryCodeShape = (code) => /^[A-Z0-9]{10}$/.test(normaliseRecoveryCode(code));

// ---------------------------------------------------------------------------
// Status, enrolment, removal
// ---------------------------------------------------------------------------

const loadWithSecrets = (userId) =>
    // Additive `+` selects only: mixing them with an inclusive `totp` projection
    // would be a path collision on the nested fields.
    User.findById(userId).select('+password +totp.secret +totp.pendingSecret +totp.lastUsedStep +totp.recoveryCodes');

export const isStaffRole = (role) => STAFF_ROLES.includes(role);

export const getStatus = async (userId) => {
    const user = await User.findById(userId).select('role totp.enabled totp.enabledAt +totp.recoveryCodes').lean();
    if (!user) throw new TotpError('NOT_FOUND', 'User not found', 404);
    const enabled = Boolean(user.totp?.enabled);
    return {
        enabled,
        enabledAt: user.totp?.enabledAt ?? null,
        recoveryCodesRemaining: enabled ? (user.totp?.recoveryCodes ?? []).filter((c) => !c.usedAt).length : 0,
        // Staff cannot turn it off (plan.md §28.3 rule 5).
        required: isStaffRole(user.role),
    };
};

/**
 * Start (or restart) enrolment. Returns the secret and the otpauth URI for the
 * QR code. Nothing changes for sign-in until `confirmSetup` proves the app
 * produces matching codes, so abandoning setup halfway cannot lock anyone out.
 */
export const beginSetup = async (userId) => {
    const user = await loadWithSecrets(userId);
    if (!user) throw new TotpError('NOT_FOUND', 'User not found', 404);
    if (user.totp?.enabled) {
        throw new TotpError('TOTP_ALREADY_ENABLED', 'An authenticator app is already set up. Remove it first to set up a new one.', 409);
    }

    const secret = generateSecret();
    await User.updateOne(
        { _id: userId },
        { $set: { 'totp.pendingSecret': encryptSecret(secret), 'totp.pendingCreatedAt': new Date() } }
    );

    return { secret, otpauthUri: otpauthUri({ secret, accountName: user.email }) };
};

/**
 * Finish enrolment: the first code from the app must verify against the
 * pending secret. Returns the recovery codes — the only time they are ever
 * available in clear.
 */
export const confirmSetup = async (userId, code) => {
    const user = await loadWithSecrets(userId);
    if (!user) throw new TotpError('NOT_FOUND', 'User not found', 404);
    if (user.totp?.enabled) throw new TotpError('TOTP_ALREADY_ENABLED', 'An authenticator app is already set up.', 409);

    const pending = user.totp?.pendingSecret;
    const createdAt = user.totp?.pendingCreatedAt;
    if (!pending || !createdAt || Date.now() - new Date(createdAt).getTime() > PENDING_SETUP_TTL_MS) {
        throw new TotpError('TOTP_SETUP_EXPIRED', 'Setup has expired. Please start again.', 410);
    }

    const secret = decryptSecret(pending);
    const step = verifyTotp(secret, String(code ?? '').trim());
    if (step === null) throw new TotpError('TOTP_INVALID', 'That code did not match. Check the time on your phone and try the newest code.', 401);

    const { codes, stored } = mintRecoveryCodes();
    // The `enabled: false` filter makes a double submit enable once.
    const { modifiedCount } = await User.updateOne(
        { _id: userId, 'totp.enabled': { $ne: true } },
        {
            $set: {
                'totp.enabled': true,
                'totp.enabledAt': new Date(),
                'totp.secret': pending,
                'totp.pendingSecret': null,
                'totp.pendingCreatedAt': null,
                'totp.lastUsedStep': step,
                'totp.recoveryCodes': stored,
            },
        }
    );
    if (!modifiedCount) throw new TotpError('TOTP_ALREADY_ENABLED', 'An authenticator app is already set up.', 409);

    return { recoveryCodes: codes };
};

/**
 * Verify a second factor for a user with TOTP on: a current authenticator code
 * or an unused recovery code. Consumes what it accepts (advances the replay
 * step, or marks the recovery code used), and both are compare-and-set, so two
 * concurrent requests carrying the same code cannot both succeed.
 *
 * Returns `{ ok: true, method: 'totp' | 'recovery', recoveryCodesRemaining }`
 * or `{ ok: false }`.
 */
export const verifyFactor = async (userId, rawCode) => {
    const code = String(rawCode ?? '').trim();
    const user = await loadWithSecrets(userId);
    if (!user?.totp?.enabled || !user.totp.secret) return { ok: false };

    if (/^\d{6}$/.test(code)) {
        const lastUsedStep = user.totp.lastUsedStep ?? -1;
        const step = verifyTotp(decryptSecret(user.totp.secret), code, { afterStep: lastUsedStep });
        if (step === null) return { ok: false };
        const { modifiedCount } = await User.updateOne(
            { _id: userId, 'totp.lastUsedStep': lastUsedStep },
            { $set: { 'totp.lastUsedStep': step } }
        );
        return modifiedCount ? { ok: true, method: 'totp' } : { ok: false };
    }

    if (isRecoveryCodeShape(code)) {
        const hash = hashRecoveryCode(code);
        const { modifiedCount } = await User.updateOne(
            { _id: userId, 'totp.recoveryCodes': { $elemMatch: { hash, usedAt: null } } },
            { $set: { 'totp.recoveryCodes.$.usedAt': new Date() } }
        );
        if (!modifiedCount) return { ok: false };
        const remaining = user.totp.recoveryCodes.filter((c) => !c.usedAt && c.hash !== hash).length;
        return { ok: true, method: 'recovery', recoveryCodesRemaining: remaining };
    }

    return { ok: false };
};

/** Password plus a current factor: what removing or re-issuing requires. */
const requirePasswordAndFactor = async (userId, { password, code }) => {
    const user = await loadWithSecrets(userId);
    if (!user) throw new TotpError('NOT_FOUND', 'User not found', 404);
    if (!user.totp?.enabled) throw new TotpError('TOTP_NOT_ENABLED', 'No authenticator app is set up.', 409);
    if (typeof password !== 'string' || !(await bcrypt.compare(password, user.password))) {
        throw new TotpError('BAD_PASSWORD', 'Current password is incorrect', 401);
    }
    const factor = await verifyFactor(userId, code);
    if (!factor.ok) throw new TotpError('TOTP_INVALID', 'That code did not match.', 401);
    return { user, factor };
};

/**
 * Turn TOTP off, by the holder. Staff cannot (§28.3 rule 5): the console
 * would lock them out the moment they did, and "an admin who disabled their
 * own second factor" is exactly what an attacker holding the password does.
 */
export const disable = async (userId, { password, code }) => {
    const role = (await User.findById(userId).select('role').lean())?.role;
    if (isStaffRole(role)) {
        throw new TotpError('TOTP_REQUIRED_FOR_STAFF', 'Staff accounts must keep an authenticator app. Ask an admin to reset it if you are replacing your phone.', 403);
    }
    await requirePasswordAndFactor(userId, { password, code });
    await User.updateOne({ _id: userId }, { $set: clearedTotp() });
};

export const regenerateRecoveryCodes = async (userId, { password, code }) => {
    await requirePasswordAndFactor(userId, { password, code });
    const { codes, stored } = mintRecoveryCodes();
    await User.updateOne({ _id: userId }, { $set: { 'totp.recoveryCodes': stored } });
    return { recoveryCodes: codes };
};

const clearedTotp = () => ({
    'totp.enabled': false,
    'totp.enabledAt': null,
    'totp.secret': null,
    'totp.pendingSecret': null,
    'totp.pendingCreatedAt': null,
    'totp.lastUsedStep': -1,
    'totp.recoveryCodes': [],
});

/**
 * Admin "Reset 2FA" (plan.md §28.2), the last step of the recovery policy.
 *
 * Also signs the account out everywhere: the usual reason is a lost or stolen
 * phone, and whoever holds that phone may hold a session too. Returns whether
 * TOTP was on, so the caller can refuse a reset that would do nothing.
 */
export const adminReset = async (userId) => {
    const before = await User.findById(userId).select('email firstName role totp.enabled').lean();
    if (!before) throw new TotpError('NOT_FOUND', 'User not found', 404);
    if (!before.totp?.enabled) throw new TotpError('TOTP_NOT_ENABLED', 'This account has no authenticator app set up.', 409);

    await User.updateOne({ _id: userId }, { $set: { ...clearedTotp(), fcmTokens: [] }, $inc: { tokenVersion: 1 } });
    const { deletedCount } = await Session.deleteMany({ userId });
    return { user: before, sessionsRevoked: deletedCount };
};

/** For tests and diagnostics: the step a code would have to beat right now. */
export const currentStep = () => stepAt();

export default {
    getStatus, beginSetup, confirmSetup, verifyFactor, disable, regenerateRecoveryCodes, adminReset,
    encryptSecret, decryptSecret, isStaffRole, TotpError,
};
