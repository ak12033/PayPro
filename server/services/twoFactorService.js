import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import Otp, { OTP_MAX_ATTEMPTS, OTP_TTL_MS } from '../models/Otp.js';
import sendOtp from '../utils/sendOtp.js';
import { scoreMatch } from './deviceFingerprintService.js';
import securityConfig from '../config/security.js';
import logger from '../utils/logger.js';
import { verifyFactor } from './totpService.js';

/**
 * Second-factor challenges.
 *
 * Owns the whole lifecycle of an emailed code: minting it, binding it to the
 * thing it authorises, resending it, and consuming it exactly once.
 *
 * ---------------------------------------------------------------------------
 * Binding, and why a code is not just a code
 * ---------------------------------------------------------------------------
 * A six-digit code that authorises "the next login for this email address" is
 * weaker than it looks. An attacker who is phishing the user in real time, or
 * who can read the code by any means, submits it from their own machine and is
 * let in — the code proves someone received the email, not that the person at
 * the keyboard is the one who asked.
 *
 * Every challenge therefore carries:
 *
 *   challengeId   a 128-bit random value returned to the client that started
 *                 the login and required back on verification, so a code cannot
 *                 be replayed against a *different* pending challenge;
 *   device        the fingerprint the challenge was issued to, so the code only
 *                 works from the browser that triggered it.
 *
 * Single use is enforced by the delete, and the attempt counter bounds guessing
 * of the 10^6 code space.
 */

const OTP_BCRYPT_ROUNDS = 10;

const generateCode = () => {
    /**
     * crypto.randomInt, not Math.random.
     *
     * Math.random is a non-cryptographic PRNG whose internal state can be
     * recovered from a handful of outputs — which for a security code means an
     * attacker who has seen a few of them can predict the next.
     */
    return String(crypto.randomInt(100000, 1000000));
};

const deliver = (email, code, purpose) => {
    // Fire-and-forget: SMTP latency must not hold the HTTP response open, and an
    // SMTP outage must not turn a valid login into a 500.
    sendOtp(email, code, purpose).catch((err) =>
        logger.error('OTP delivery failed', { purpose, error: err.message })
    );
};

/**
 * Issue a login challenge bound to the device that asked for it.
 *
 * Any earlier login codes are cleared first: without that, a user who pressed
 * "sign in" twice ended up with two live challenges and no guarantee that the
 * one they were emailed is the one verification would look at.
 */
export const issueLoginChallenge = async (user, {
    prints = {},
    deviceId = null,
    loginHistoryId = null,
    ip = null,
    reasons = [],
    riskScore = 0,
} = {}) => {
    // An authenticator replaces the emailed code rather than sitting beside it.
    const method = user.totp?.enabled ? 'totp' : 'email';
    const code = method === 'email' ? generateCode() : null;
    const otpHash = code ? await bcrypt.hash(code, OTP_BCRYPT_ROUNDS) : undefined;
    const challengeId = crypto.randomBytes(16).toString('hex');

    await Otp.deleteMany({ email: user.email, purpose: 'login' });

    await Otp.create({
        email: user.email,
        otpHash,
        purpose: 'login',
        expiry: new Date(Date.now() + OTP_TTL_MS),
        context: {
            challengeId,
            method,
            userId: String(user._id),
            deviceId: deviceId ? String(deviceId) : null,
            loginHistoryId: loginHistoryId ? String(loginHistoryId) : null,
            deviceFingerprint: prints.deviceFingerprint ?? null,
            coreFingerprint: prints.coreFingerprint ?? null,
            browserFingerprint: prints.browserFingerprint ?? null,
            ip,
            riskScore,
            reasons,
        },
    });

    if (code) deliver(user.email, code, 'login');

    return { challengeId, method };
};

/**
 * Re-send the code for the challenge already in flight.
 *
 * Keeps the original context — including the challengeId and the device binding
 * — so a resend cannot be used to launder a challenge onto a different device,
 * and so the client's stored challengeId stays valid.
 */
export const reissueLoginChallenge = async (email) => {
    const pending = await Otp.findOne({ email, purpose: 'login' }).sort({ createdAt: -1 });
    if (!pending) return false;
    // Nothing to resend: the code is on the user's phone. Emailing one here
    // would turn "resend" into a way around the authenticator.
    if (pending.context?.method === 'totp') return false;

    const code = generateCode();
    const otpHash = await bcrypt.hash(code, OTP_BCRYPT_ROUNDS);

    await Otp.deleteMany({ email, purpose: 'login' });
    await Otp.create({
        email,
        otpHash,
        purpose: 'login',
        expiry: new Date(Date.now() + OTP_TTL_MS),
        context: pending.context,
    });

    deliver(email, code, 'login');
    return true;
};

/** Constant-time equality for opaque identifiers. */
const safeEqual = (a, b) => {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

/**
 * Fetch, validate and consume a challenge.
 *
 * Returns `{ record }` on success or `{ status, message }` describing the
 * failure. Always picks the most recent challenge for the (email, purpose)
 * pair: `findOne` without a sort returns an arbitrary document, which used to
 * make the code the user had just received unusable when an older row existed.
 */
export const consumeChallenge = async (email, purpose, otp, { verify = null } = {}) => {
    const record = await Otp.findOne({ email, purpose }).sort({ createdAt: -1 });

    if (!record) {
        return { status: 400, message: 'No verification code found. Please request a new one.' };
    }

    if (record.expiry.getTime() < Date.now()) {
        await Otp.deleteOne({ _id: record._id });
        return { status: 410, message: 'Code expired. Please request a new one.' };
    }

    /**
     * Bounded attempts. A 6-digit code has only 10^6 possibilities, so an
     * unthrottled endpoint yields the code in minutes.
     */
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
        await Otp.deleteOne({ _id: record._id });
        return { status: 429, message: 'Too many incorrect attempts. Please request a new code.' };
    }

    const isMatch = verify
        ? await verify(record, String(otp))
        : await bcrypt.compare(String(otp), record.otpHash ?? '');

    if (!isMatch) {
        await Otp.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
        return { status: 401, message: 'Invalid code. Please check and try again.' };
    }

    /**
     * Single-use consumption.
     *
     * deleteOne with the _id filter returns deletedCount 0 if another concurrent
     * request already consumed this record, which closes the replay window
     * between "compare succeeded" and "record deleted".
     */
    const { deletedCount } = await Otp.deleteOne({ _id: record._id });
    if (deletedCount === 0) {
        return { status: 409, message: 'This code has already been used.' };
    }

    return { record, factor: record.factor ?? null };
};

/**
 * The verifier for an authenticator challenge, or null for an emailed one.
 *
 * The factor result (which method, recovery codes left) is stashed on the
 * record so the caller can audit and warn about recovery-code use.
 */
export const factorVerifierFor = (pending) => {
    if (pending?.context?.method !== 'totp') return null;
    return async (record, code) => {
        const factor = await verifyFactor(record.context.userId, code);
        record.factor = factor;
        return factor.ok;
    };
};

/**
 * Verify a login challenge, enforcing the bindings.
 *
 * The bindings are checked *before* the code is consumed, so a request from the
 * wrong device cannot burn the legitimate user's challenge — otherwise an
 * attacker who knows the victim's email could invalidate every code the victim
 * is sent, which is a denial of service on their ability to log in at all.
 */
export const verifyLoginChallenge = async ({ email, otp, challengeId, prints }) => {
    const pending = await Otp.findOne({ email, purpose: 'login' }).sort({ createdAt: -1 });

    if (pending?.context?.challengeId) {
        if (!safeEqual(String(challengeId ?? ''), pending.context.challengeId)) {
            return {
                status: 400,
                message: 'This verification link is no longer valid. Please sign in again.',
            };
        }

        const bound = {
            deviceFingerprint: pending.context.deviceFingerprint,
            coreFingerprint: pending.context.coreFingerprint,
            browserFingerprint: pending.context.browserFingerprint,
        };

        /**
         * The device must still look like the one that started the login.
         *
         * Fuzzy tolerance is allowed here for the same reason it is allowed at
         * login: an attribute can shift between the two requests (an external
         * monitor waking up, a rotated phone). The threshold is the same, so
         * the check is no weaker than device recognition itself.
         */
        if (bound.deviceFingerprint && prints) {
            const score = scoreMatch(bound, prints);
            if (score < securityConfig.trustedDevice.fuzzyMatchThreshold) {
                return {
                    status: 401,
                    message: 'This code was issued for a different device. Please sign in again.',
                };
            }
        }
    }

    const result = await consumeChallenge(email, 'login', otp, { verify: factorVerifierFor(pending) });
    if (result.message) return result;

    return { record: result.record, context: result.record.context || {}, factor: result.factor };
};

export default {
    issueLoginChallenge,
    reissueLoginChallenge,
    verifyLoginChallenge,
    consumeChallenge,
    factorVerifierFor,
};
