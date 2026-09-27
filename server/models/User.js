import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    firstName: { type: String, required: true, trim: true, maxlength: 60 },
    lastName: { type: String, trim: true, maxlength: 60, default: '' },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        maxlength: 254
    },
    /**
     * Whether the holder has proven they control `email` (plan.md §31.2.7).
     *
     * Signup used to accept any address, so anyone could register someone
     * else's email — squatting it, and pointing that person's inbox at OTPs
     * and money alerts for an account they never opened. Set by the signup
     * verification code, and also by any other flow that already proves inbox
     * control (a verified login 2FA code, a completed password reset).
     *
     * Defaults to false with no grandfathering, deliberately: an account that
     * predates this field has proven nothing either. It costs such a user one
     * code, once, before their next outgoing transfer or top-up
     * (`middlewares/requireVerifiedEmail.js`). Changing the address resets it.
     */
    emailVerified: { type: Boolean, default: false },
    emailVerifiedAt: { type: Date, default: null },
    // select:false so a stray `User.findById(id)` can never serialise the hash
    // into an API response. Use `.select('+password')` where it is genuinely needed.
    password: { type: String, required: true, select: false },
    /**
     * A convenience copy of the most recent login's place, for the greeting on
     * the account screen. It is *not* the input to any security decision —
     * TrustedDevice and LoginHistory are, because a single "last location" per
     * account cannot describe someone who owns a laptop and a phone, and using
     * it as the location baseline is what made every alternating device switch
     * look like a suspicious login.
     */
    lastLoginLocation: {
        city: String,
        state: String,
        country: String,
        latitude: Number,
        longitude: Number,
        ip: String,
        isp: String,
    },
    /**
     * No `min: 0` validator, deliberately (plan.md §4.4).
     *
     * There used to be one, and it was a lie: Mongoose does not run validators
     * on `$inc`, and `ledgerService.debitForRefund` legitimately drives a
     * balance below zero when a gateway refund arrives after the money was
     * spent. The schema claimed an invariant the code did not hold. Ordinary
     * spending still cannot overdraw — `debitWallet`'s `$gte` filter is the
     * real guard — so the only way below zero is that refund path, which
     * audits `wallet.overdraft` and is rendered as "amount owed" in the UI.
     */
    accountBalance: {
        type: Number,
        default: 0,
    },
    fcmTokens: { type: [String], default: [] },
    preferences: {
        twoFactorAuth: { type: Boolean, default: false },
        transaction2FA: { type: Boolean, default: true },
        emailAlerts: { type: Boolean, default: true },
        pushNotifications: { type: Boolean, default: true },
        /** Budget threshold notifications (plan.md §14.2) — read, unlike the historical emailAlerts gap. */
        budgetAlerts: { type: Boolean, default: true },
        /**
         * Per-category push (plan.md §26.2.4), read by
         * `services/notificationPolicy.js`. Additive rather than the plan's
         * full replacement of the booleans above: those keep their meaning as
         * master switches, so nothing needs migrating and an older client
         * keeps working. There is deliberately no `security` key — security
         * alerts cannot be switched off (§26.3).
         */
        pushCategories: {
            payment: { type: Boolean, default: true },
            budget: { type: Boolean, default: true },
            goal: { type: Boolean, default: true },
            bills: { type: Boolean, default: true },
            insights: { type: Boolean, default: true },
            support: { type: Boolean, default: true },
        },
        /** Quiet hours for non-security pushes, whole hours in APP_TIMEZONE, `[start, end)` (§26.2.5). */
        quietHours: {
            enabled: { type: Boolean, default: false },
            start: { type: Number, min: 0, max: 23, default: 22 },
            end: { type: Number, min: 0, max: 23, default: 7 },
        },
    },
    // Bumped whenever credentials change, so access tokens minted before a
    // password change can be rejected without waiting out their 15m expiry.
    tokenVersion: { type: Number, default: 0 },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    /**
     * Authorization, added in Phase 2. Every existing user defaults to
     * 'user'/'active', so this is additive — no backfill needed, same
     * reasoning as Transaction.status defaulting to SUCCESS in Phase 1.
     * `requireRole` re-reads this from the database rather than trusting the
     * JWT, so a demotion or suspension takes effect immediately instead of
     * waiting out the access token's 15-minute TTL.
     */
    role: { type: String, enum: ['user', 'support', 'risk', 'admin'], default: 'user', index: true },
    status: { type: String, enum: ['active', 'suspended', 'closed'], default: 'active', index: true },
    /**
     * Governs the velocity/balance ceilings in `services/limitService.js`.
     * Written **only** by `kycService` (Phase 5): a reviewer's VERIFIED
     * decision sets `basic` or `full`, and any move out of VERIFIED sets it back
     * to `unverified`, in the same transaction as the append-only
     * `KycDecision` (plan.md §0.20.2). `emailVerified` never raises it.
     */
    kycTier: { type: String, enum: ['unverified', 'basic', 'full'], default: 'unverified' },
    /**
     * The balance, in integer paise — the source of truth since plan.md §7.4
     * step 3. Every guard (`debitWallet`'s `$gte`), check and response reads
     * this. `accountBalance` is still `$inc`d in lockstep by every
     * `ledgerService` mutation, for one release, as the rollback path.
     */
    balanceMinor: { type: Number, default: 0 },
    /**
     * Authenticator-app second factor (plan.md §31.2.4), managed only by
     * `services/totpService.js`.
     *
     * When enabled it *replaces* the emailed code for login and transfer
     * challenges, rather than sitting beside it: an email fallback would leave
     * the account exactly as strong as the email account. Recovery is the ten
     * one-time codes shown at enrolment, and after those an admin "Reset 2FA"
     * (audited, the holder is emailed).
     *
     * Secrets are AES-256-GCM encrypted and `select: false`; recovery codes are
     * stored only as SHA-256 hashes. `lastUsedStep` is the replay guard: a code
     * at or before the last accepted time step is refused.
     */
    totp: {
        enabled: { type: Boolean, default: false },
        enabledAt: { type: Date, default: null },
        secret: { type: String, default: null, select: false },
        pendingSecret: { type: String, default: null, select: false },
        pendingCreatedAt: { type: Date, default: null },
        lastUsedStep: { type: Number, default: -1, select: false },
        recoveryCodes: {
            type: [{ _id: false, hash: String, usedAt: { type: Date, default: null } }],
            default: [],
            select: false,
        },
    },
}, { timestamps: true });

// `unique: true` on email already creates that index.
// Supports the recipient picker's name search.
userSchema.index({ firstName: 1, lastName: 1 });

userSchema.methods.isLocked = function () {
    return Boolean(this.lockUntil && this.lockUntil > new Date());
};

export default mongoose.model('User', userSchema);
