import mongoose from 'mongoose';

/**
 * Every authenticated sign-in attempt that got past the password.
 *
 * Distinct from AuditLog on purpose. The audit log is a flat, append-only
 * stream of *everything* security-relevant, optimised for reading back to a
 * human. This collection is a structured, queryable record of *logins*, and the
 * risk engine reads it on the hot path to answer "has this user ever signed in
 * from near here before?". Mixing the two would mean either a schemaless
 * metadata blob that cannot be indexed, or an audit log with thirty columns.
 *
 * Location is always server-derived from the connecting IP. A client-supplied
 * coordinate would let an attacker claim the victim's home city and walk
 * straight past the location checks, and precise GPS is not collected at all.
 */
const loginHistorySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    deviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrustedDevice', default: null },

    ip: { type: String, default: null },
    city: { type: String, default: null },
    state: { type: String, default: null },
    country: { type: String, default: null },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    isp: { type: String, default: null },
    suspectedProxy: { type: Boolean, default: false },

    userAgent: { type: String, default: null },
    browser: { type: String, default: null },
    os: { type: String, default: null },
    deviceType: { type: String, default: null },
    screenResolution: { type: String, default: null },
    language: { type: String, default: null },
    timezone: { type: String, default: null },

    /** Was the device trusted *at the moment of this login*. */
    deviceTrusted: { type: Boolean, default: false },

    loginTime: { type: Date, default: Date.now },
    riskScore: { type: Number, default: 0 },
    /** The signals that produced the score, kept for tuning and for support. */
    riskReasons: { type: [String], default: [] },
    twoFactorRequired: { type: Boolean, default: false },
    twoFactorPassed: { type: Boolean, default: false },
}, { timestamps: true });

// "Where has this user signed in recently" — the risk engine's main read.
loginHistorySchema.index({ userId: 1, loginTime: -1 });
loginHistorySchema.index({ userId: 1, deviceId: 1, loginTime: -1 });

/**
 * Retention matches the audit log's 400 days: long enough for a full review
 * cycle, short enough that the collection does not grow without bound.
 */
loginHistorySchema.index({ loginTime: 1 }, { expireAfterSeconds: 400 * 24 * 60 * 60 });

export default mongoose.model('LoginHistory', loginHistorySchema);
