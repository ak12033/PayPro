import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { mongoStore } from './mongoRateLimitStore.js';

/**
 * Rate limiting.
 *
 * The application previously had none whatsoever. That left every one of these
 * open to unbounded automation:
 *
 *   - POST /auth/login          — password brute force
 *   - POST /auth/verify-login-otp — 6-digit OTP brute force (10^6 space)
 *   - POST /auth/resend-login-otp — free email-bombing relay via our SMTP account
 *   - POST /transactions/transfer — transfer flooding
 *
 * AI spend is no longer limited here: the browser calls the AI service
 * directly, which applies its own per-user ceiling (fastapi-server/app/ratelimit.py).
 *
 * Keys are per-IP by default and per-user where the route is authenticated,
 * because a single authenticated attacker rotating IPs would otherwise slip
 * through an IP-only limit.
 *
 * Every limiter below carries its own `MongoStore` (mongoRateLimitStore.js)
 * instead of the package default in-process Map. `server/vercel.json` implies
 * a deployment where each invocation can be a fresh process, and even a
 * long-lived deployment typically runs more than one replica — either way, a
 * memory store gives each process its own counter, so the real ceiling is
 * `limit × replicaCount`, not `limit`. See mongoRateLimitStore.js for why
 * Mongo rather than adding Redis.
 */

const standard = {
    standardHeaders: true,
    legacyHeaders: false,
    /**
     * Disable counting under the test runner only.
     *
     * Every limiter shares one counter collection across every test file in
     * the run (they all hit the same in-memory Mongo instance), so without
     * this a test file that exercises signup or login several times trips a
     * real limit and gets a 429 for reasons unrelated to what it is asserting.
     *
     * The check is deliberately an exact match on 'test' — the value the test
     * setup assigns — so no production or staging environment can land in this
     * branch by accident. Rate limiting itself is covered by a dedicated test
     * that re-enables it explicitly.
     */
    skip: () => process.env.NODE_ENV === 'test' && process.env.ENFORCE_RATE_LIMITS !== 'true',
};

/**
 * Key on the authenticated user when we have one, otherwise on the IP.
 *
 * The IP fallback goes through `ipKeyGenerator`, which collapses an IPv6
 * address to its /64 prefix. Keying on the raw address would be useless against
 * IPv6 clients: a single /64 allocation contains 2^64 addresses, so an attacker
 * gets a fresh bucket for every request just by picking a new source address.
 */
const byUserOrIp = (req) => req.user?.id || ipKeyGenerator(req.ip);

export const loginLimiter = rateLimit({
    ...standard,
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    store: mongoStore('login'),
    message: { message: 'Too many login attempts. Please try again in 15 minutes.' },
});

export const signupLimiter = rateLimit({
    ...standard,
    windowMs: 60 * 60 * 1000,
    limit: 5,
    store: mongoStore('signup'),
    message: { message: 'Too many accounts created from this address. Please try again later.' },
});

/** Verification attempts — tight, because the code space is only 10^6. */
export const otpVerifyLimiter = rateLimit({
    ...standard,
    windowMs: 15 * 60 * 1000,
    limit: 10,
    store: mongoStore('otp-verify'),
    message: { message: 'Too many verification attempts. Please request a new code.' },
});

/** Sending costs us an email; keep it well below abuse thresholds. */
export const otpSendLimiter = rateLimit({
    ...standard,
    windowMs: 15 * 60 * 1000,
    limit: 4,
    keyGenerator: byUserOrIp,
    store: mongoStore('otp-send'),
    message: { message: 'Too many codes requested. Please wait before trying again.' },
});

/**
 * Password reset. Unauthenticated by necessity (the whole point is the user
 * cannot sign in), so it is keyed on IP rather than a user id, and kept tight:
 * this is both an email-bombing surface and, for the verify step, a guess
 * space for the reset code.
 */
export const passwordResetLimiter = rateLimit({
    ...standard,
    windowMs: 15 * 60 * 1000,
    limit: 5,
    store: mongoStore('password-reset'),
    message: { message: 'Too many password reset attempts. Please try again later.' },
});

/** Money movement. */
export const transferLimiter = rateLimit({
    ...standard,
    windowMs: 60 * 1000,
    limit: 10,
    keyGenerator: byUserOrIp,
    store: mongoStore('transfer'),
    message: { message: 'Too many transfer attempts. Please wait a moment.' },
});

export const paymentLimiter = rateLimit({
    ...standard,
    windowMs: 60 * 1000,
    limit: 15,
    keyGenerator: byUserOrIp,
    store: mongoStore('payment'),
    message: { message: 'Too many payment requests. Please wait a moment.' },
});

/**
 * The refresh endpoint. Unauthenticated (that is the point of it) and now a
 * state-changing POST rather than a GET — see authController.refresh and
 * utils/token.js for the CSRF defence this pairs with. Keyed on IP: there is
 * no `req.user` yet at this point in the request.
 */
export const refreshLimiter = rateLimit({
    ...standard,
    windowMs: 15 * 60 * 1000,
    limit: 30,
    store: mongoStore('refresh'),
    message: { message: 'Too many session refresh attempts. Please sign in again.' },
});

/** Every route under /api/admin/*, on top of the per-route role check. */
export const adminLimiter = rateLimit({
    ...standard,
    windowMs: 60 * 1000,
    limit: 60,
    keyGenerator: byUserOrIp,
    store: mongoStore('admin'),
    message: { message: 'Too many admin requests. Please wait a moment.' },
});

/**
 * `GET /users/all` without a search term is a directory-enumeration surface
 * (plan.md §4.9) even with a minimal projection — someone can still page
 * through every name in the system. Tighter than the general per-user limits
 * above because paging costs us nothing per request, so volume is the only
 * signal available.
 */
export const directoryLimiter = rateLimit({
    ...standard,
    windowMs: 60 * 1000,
    limit: 20,
    keyGenerator: byUserOrIp,
    store: mongoStore('directory'),
    message: { message: 'Too many directory lookups. Please wait a moment.' },
});

/**
 * On-demand recurring detection (plan.md §18.1).
 *
 * The only user-triggerable endpoint that aggregates 180 days of transactions.
 * Detection is normally nightly; this exists so a new user sees something
 * immediately, which is a once-in-a-while need, not a per-page-load one.
 */
export const detectionLimiter = rateLimit({
    ...standard,
    windowMs: 5 * 60 * 1000,
    limit: 5,
    keyGenerator: byUserOrIp,
    store: mongoStore('detection'),
    message: { message: 'Detection was just run. Please wait a few minutes.' },
});

/**
 * Ticket creation. Deliberately generous on reads (none) and tight on writes:
 * a support queue flooded with duplicate tickets is a denial of service against
 * the people who need it, not just against the server.
 */
export const supportLimiter = rateLimit({
    ...standard,
    windowMs: 60 * 60 * 1000,
    limit: 10,
    keyGenerator: byUserOrIp,
    store: mongoStore('support'),
    message: { message: 'You have opened several tickets recently. Please reply on an existing one.' },
});

/**
 * Payment-code issuance (plan.md §9.3).
 *
 * Codes are short-lived, so a user legitimately refreshes one now and then;
 * minting them in bulk is not a use case, and each one is a signed bearer
 * identifier for the account.
 */
export const paymentCodeLimiter = rateLimit({
    ...standard,
    windowMs: 60 * 1000,
    limit: 10,
    keyGenerator: byUserOrIp,
    store: mongoStore('paymentcode'),
    message: { message: 'Too many payment code requests. Please wait a moment.' },
});

/**
 * Document uploads (Phase 5: KYC evidence, bank-account proof). Each one is up
 * to 5 MB of encrypted storage; a holder needs a handful, not hundreds.
 */
export const uploadLimiter = rateLimit({
    ...standard,
    windowMs: 60 * 60 * 1000,
    limit: 20,
    keyGenerator: byUserOrIp,
    store: mongoStore('upload'),
    message: { message: 'Too many uploads. Please try again later.' },
});

/** KYC submissions and bank-account additions: rare, deliberate actions. */
export const verificationLimiter = rateLimit({
    ...standard,
    windowMs: 60 * 60 * 1000,
    limit: 10,
    keyGenerator: byUserOrIp,
    store: mongoStore('verification'),
    message: { message: 'Too many attempts. Please try again later.' },
});

/** Broad backstop for everything else. */
export const globalLimiter = rateLimit({
    ...standard,
    windowMs: 60 * 1000,
    limit: 300,
    store: mongoStore('global'),
    message: { message: 'Too many requests. Please slow down.' },
});
