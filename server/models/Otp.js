import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema({
    email: { type: String, required: true, lowercase: true, trim: true },
    otpHash: { type: String, required: true },
    /**
     * Separates login-2FA codes from transfer-2FA codes.
     *
     * Previously both flows wrote into one collection keyed only by email, so a
     * code issued for a transfer satisfied a login challenge (and vice versa),
     * and a resend on the unauthenticated transaction route silently deleted a
     * pending login code.
     */
    purpose: {
        type: String,
        enum: ['login', 'transfer'],
        required: true
    },
    // Bounded verification attempts: a 6-digit code falls in ~500k tries
    // when the endpoint allows unlimited guesses.
    attempts: { type: Number, default: 0 },
    /**
     * Payload bound to the challenge. For transfers this pins the exact
     * recipient and amount, so a verified OTP cannot authorise a *different*
     * transfer than the one the user was shown.
     */
    context: { type: mongoose.Schema.Types.Mixed, default: {} },
    expiry: { type: Date, required: true }
}, { timestamps: true });

otpSchema.index({ email: 1, purpose: 1 });
// TTL sweep — expired OTP documents previously accumulated forever.
otpSchema.index({ expiry: 1 }, { expireAfterSeconds: 0 });

export const OTP_MAX_ATTEMPTS = 5;
export const OTP_TTL_MS = 10 * 60 * 1000;

export default mongoose.model('Otp', otpSchema);
