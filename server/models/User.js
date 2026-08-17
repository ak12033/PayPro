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
    accountBalance: {
        type: Number,
        default: 0,
        min: [0, 'Account balance cannot be negative']
    },
    fcmTokens: { type: [String], default: [] },
    preferences: {
        twoFactorAuth: { type: Boolean, default: false },
        transaction2FA: { type: Boolean, default: true },
        emailAlerts: { type: Boolean, default: true },
        pushNotifications: { type: Boolean, default: true }
    },
    // Bumped whenever credentials change, so access tokens minted before a
    // password change can be rejected without waiting out their 15m expiry.
    tokenVersion: { type: Number, default: 0 },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null }
}, { timestamps: true });

// `unique: true` on email already creates that index.
// Supports the recipient picker's name search.
userSchema.index({ firstName: 1, lastName: 1 });

userSchema.methods.isLocked = function () {
    return Boolean(this.lockUntil && this.lockUntil > new Date());
};

export default mongoose.model('User', userSchema);
