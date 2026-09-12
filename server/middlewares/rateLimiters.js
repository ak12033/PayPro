import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

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
 */

const standard = {
    standardHeaders: true,
    legacyHeaders: false,
    /**
     * Disable counting under the test runner only.
     *
     * The limiters keep their counters in process memory, so a test file that
     * exercises signup or login several times trips a real production limit and
     * gets a 429 for reasons unrelated to what it is asserting.
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
    message: { message: 'Too many login attempts. Please try again in 15 minutes.' },
});

export const signupLimiter = rateLimit({
    ...standard,
    windowMs: 60 * 60 * 1000,
    limit: 5,
    message: { message: 'Too many accounts created from this address. Please try again later.' },
});

/** Verification attempts — tight, because the code space is only 10^6. */
export const otpVerifyLimiter = rateLimit({
    ...standard,
    windowMs: 15 * 60 * 1000,
    limit: 10,
    message: { message: 'Too many verification attempts. Please request a new code.' },
});

/** Sending costs us an email; keep it well below abuse thresholds. */
export const otpSendLimiter = rateLimit({
    ...standard,
    windowMs: 15 * 60 * 1000,
    limit: 4,
    keyGenerator: byUserOrIp,
    message: { message: 'Too many codes requested. Please wait before trying again.' },
});

/** Money movement. */
export const transferLimiter = rateLimit({
    ...standard,
    windowMs: 60 * 1000,
    limit: 10,
    keyGenerator: byUserOrIp,
    message: { message: 'Too many transfer attempts. Please wait a moment.' },
});

export const paymentLimiter = rateLimit({
    ...standard,
    windowMs: 60 * 1000,
    limit: 15,
    keyGenerator: byUserOrIp,
    message: { message: 'Too many payment requests. Please wait a moment.' },
});

/** Broad backstop for everything else. */
export const globalLimiter = rateLimit({
    ...standard,
    windowMs: 60 * 1000,
    limit: 300,
    message: { message: 'Too many requests. Please slow down.' },
});
