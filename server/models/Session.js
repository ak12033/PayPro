import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    refreshTokenHash: { type: String, required: true },
    familyId: { type: String, required: true },
    deviceInfo: {
        userAgent: String,
        ip: String
    },
    isValid: { type: Boolean, default: true },
    /**
     * Set when a token is rotated normally. Distinguishes "this token was
     * consumed by a legitimate refresh" from "this session was revoked", which
     * lets the refresh handler tell a replay attack apart from a benign
     * double-refresh race (two tabs refreshing at the same instant).
     */
    rotatedAt: { type: Date, default: null },
    replacedBy: { type: String, default: null },
    expiresAt: { type: Date, required: true }
}, { timestamps: true });

// Primary lookup on every refresh — was previously an unindexed scan of the
// entire session collection.
sessionSchema.index({ refreshTokenHash: 1 }, { unique: true });
sessionSchema.index({ familyId: 1 });
sessionSchema.index({ userId: 1, createdAt: -1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('Session', sessionSchema);
