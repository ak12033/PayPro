import mongoose from 'mongoose';
import securityConfig from '../config/security.js';

/**
 * One row per device a user has ever signed in from.
 *
 * A user owns as many of these as they like — a laptop, a desktop, a phone, a
 * tablet, a work machine — and each carries its own trust state, its own last
 * known location and its own counters. Nothing in this design assumes a single
 * device per account, which is the assumption that made the previous
 * `user.lastLoginLocation` check challenge people every time they picked up
 * their phone after using their laptop.
 *
 * Fingerprints are stored only as keyed hashes. The raw component string never
 * touches the database, so a dump of this collection does not reveal what
 * hardware anyone owns.
 */
const trustedDeviceSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    /** HMAC of the full component set. The primary identity of the device. */
    deviceFingerprint: { type: String, required: true },
    /**
     * Two coarser hashes over subsets of the same components, used to recognise
     * a device whose fingerprint has drifted slightly (a new external monitor, a
     * language change). Neither is sufficient on its own — see
     * deviceFingerprintService.scoreMatch.
     */
    coreFingerprint: { type: String, required: true },
    browserFingerprint: { type: String, required: true },

    /** Human label. Derived from the user agent, renameable by the user. */
    deviceName: { type: String, maxlength: 80, default: '' },
    browser: { type: String, default: 'Unknown' },
    os: { type: String, default: 'Unknown' },
    deviceType: { type: String, default: 'unknown' },

    trusted: { type: Boolean, default: false },
    trustedAt: { type: Date, default: null },
    /** 'user' | 'expired' | 'revoked' — why trust was last granted or removed. */
    trustState: { type: String, default: 'never_trusted' },

    firstSeenAt: { type: Date, default: Date.now },
    /**
     * Only advanced on a *fully authenticated* login. An attempt that stalled at
     * the 2FA prompt must not keep a lapsed device's trust alive.
     */
    lastSeenAt: { type: Date, default: Date.now },

    lastKnownIp: { type: String, default: null },
    lastKnownCity: { type: String, default: null },
    lastKnownState: { type: String, default: null },
    lastKnownCountry: { type: String, default: null },
    lastKnownLatitude: { type: Number, default: null },
    lastKnownLongitude: { type: Number, default: null },

    loginCount: { type: Number, default: 0 },
}, { timestamps: true });

// The lookup on every single login: "do I know this device?"
trustedDeviceSchema.index({ userId: 1, deviceFingerprint: 1 }, { unique: true });
// Drives the fuzzy fallback and the device list in account settings.
trustedDeviceSchema.index({ userId: 1, lastSeenAt: -1 });

/**
 * Trust is not permanent.
 *
 * A device that has not been used for `inactivityDays` is treated as untrusted
 * until it re-verifies, without deleting its history — the row keeps its login
 * count and its last known location, which is exactly the context a user needs
 * when reviewing devices after an incident.
 */
trustedDeviceSchema.methods.isTrustActive = function (now = new Date()) {
    if (!this.trusted) return false;
    const ttlMs = securityConfig.trustedDevice.inactivityDays * 24 * 60 * 60 * 1000;
    return now.getTime() - new Date(this.lastSeenAt).getTime() < ttlMs;
};

/** True when the device was trusted once but the trust has lapsed. */
trustedDeviceSchema.methods.isTrustExpired = function (now = new Date()) {
    return Boolean(this.trusted) && !this.isTrustActive(now);
};

export default mongoose.model('TrustedDevice', trustedDeviceSchema);
