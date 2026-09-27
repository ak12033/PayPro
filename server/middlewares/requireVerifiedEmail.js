/**
 * Refuse outgoing money movement until the account's email is verified
 * (plan.md §31.2.7).
 *
 * Mounted after `authMiddleware`, which already loads `emailVerified` onto
 * `req.user` in the same projection it uses for role and status — so this
 * adds no query. Scoped to the routes where owning the address actually
 * matters: sending money out and loading money in. Receiving, browsing and
 * every non-money screen stay available to an unverified account.
 *
 * `code: 'EMAIL_NOT_VERIFIED'` is what the client keys its "verify your email"
 * prompt on, the same way it keys a silent refresh on `TOKEN_EXPIRED`.
 *
 * Skipped under the test runner only, exactly as the rate limiters are (see
 * rateLimiters.js): hundreds of existing tests sign up and immediately move
 * money, and none of them are about verification. The check is an exact match
 * on NODE_ENV === 'test' so no real environment can land in it, and
 * `emailVerification.test.js` re-enables it with ENFORCE_EMAIL_VERIFICATION.
 */
export const requireVerifiedEmail = (req, res, next) => {
    const skip = process.env.NODE_ENV === 'test' && process.env.ENFORCE_EMAIL_VERIFICATION !== 'true';
    if (skip || req.user?.emailVerified) return next();

    return res.status(403).json({
        message: 'Verify your email address before moving money. We can send you a new code.',
        code: 'EMAIL_NOT_VERIFIED',
    });
};

export default requireVerifiedEmail;
