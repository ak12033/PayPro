import TrustedDevice from '../models/TrustedDevice.js';
import securityConfig from '../config/security.js';
import { scoreMatch } from './deviceFingerprintService.js';
import { toStoredPlace } from './locationService.js';

/**
 * The device book: which machines an account signs in from, which of them the
 * user has vouched for, and where each one was last seen.
 *
 * Every function here is scoped to a single user id. There is no call that can
 * read or mutate another account's devices, which is the property that makes
 * the revoke endpoints safe by construction rather than by review.
 */

/**
 * Find the stored device an incoming fingerprint belongs to.
 *
 * Exact match first. Failing that, the best fuzzy candidate above the
 * configured threshold — see deviceFingerprintService for why partial matching
 * exists and what the score means.
 *
 * Returns `{ device, matchType, matchScore }` with matchType 'exact' | 'fuzzy'
 * | 'none'.
 */
export const findDevice = async (userId, prints) => {
    const exact = await TrustedDevice.findOne({
        userId,
        deviceFingerprint: prints.deviceFingerprint,
    });

    if (exact) return { device: exact, matchType: 'exact', matchScore: 1 };

    /**
     * The fuzzy pass only considers devices that could plausibly be this one:
     * a shared core or browser facet. Without that filter this is a full scan of
     * the user's devices on every login.
     */
    const candidates = await TrustedDevice.find({
        userId,
        $or: [
            { coreFingerprint: prints.coreFingerprint },
            { browserFingerprint: prints.browserFingerprint },
        ],
    }).sort({ lastSeenAt: -1 }).limit(20);

    let best = { device: null, matchType: 'none', matchScore: 0 };

    for (const candidate of candidates) {
        const score = scoreMatch(candidate, prints);
        if (score > best.matchScore) {
            best = { device: candidate, matchType: 'fuzzy', matchScore: score };
        }
    }

    if (best.matchScore >= securityConfig.trustedDevice.fuzzyMatchThreshold) {
        return best;
    }

    return { device: null, matchType: 'none', matchScore: best.matchScore };
};

/**
 * Record that a device was *observed*, without granting it anything.
 *
 * Called during risk evaluation, before the login is complete, so the login
 * history has something to point at and so a first sighting is on record even
 * if the attempt is abandoned at the 2FA prompt.
 *
 * Deliberately does not touch `lastSeenAt`, `loginCount` or the last known
 * location of an existing device: an unfinished attempt must not refresh a
 * lapsing trust, must not inflate the counters, and above all must not move a
 * trusted device's location to wherever the attacker is sitting. Only
 * `confirmLogin` does that, and only after full authentication.
 */
export const observeDevice = async ({ userId, prints, context, location }) => {
    const existing = await findDevice(userId, prints);
    if (existing.device) return existing;

    const place = toStoredPlace(location);

    /**
     * upsert rather than create: two tabs submitting the same login at once
     * would otherwise race and one would fail the unique index. `setOnInsert`
     * keeps the second caller from resetting the first one's fields.
     */
    const device = await TrustedDevice.findOneAndUpdate(
        { userId, deviceFingerprint: prints.deviceFingerprint },
        {
            $setOnInsert: {
                userId,
                deviceFingerprint: prints.deviceFingerprint,
                coreFingerprint: prints.coreFingerprint,
                browserFingerprint: prints.browserFingerprint,
                deviceName: context.deviceName,
                browser: context.browser,
                os: context.os,
                deviceType: context.deviceType,
                trusted: false,
                trustState: 'never_trusted',
                firstSeenAt: new Date(),
                lastSeenAt: new Date(),
                lastKnownIp: place.ip,
                lastKnownCity: place.city,
                lastKnownState: place.state,
                lastKnownCountry: place.country,
                lastKnownLatitude: place.latitude,
                lastKnownLongitude: place.longitude,
                loginCount: 0,
            },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return { device, matchType: 'none', matchScore: 0, created: true };
};

/**
 * Promote an observation into a completed login.
 *
 * This is where a device's location moves, and it happens only once the user is
 * fully authenticated — password *and*, when it was demanded, the second
 * factor. That ordering is what makes "trigger 2FA once, then remember the new
 * city" safe: an attacker who never completes the challenge never updates
 * anything.
 *
 * The fingerprints are refreshed too, so a device recognised through the fuzzy
 * path re-anchors on its current attributes and matches exactly next time. A
 * fingerprint that drifts a little every few months would otherwise eventually
 * drift out of range of the value stored on day one.
 */
export const confirmLogin = async ({ device, prints, context, location, trust = false }) => {
    if (!device) return null;

    const place = toStoredPlace(location);
    const now = new Date();

    const update = {
        $set: {
            deviceFingerprint: prints.deviceFingerprint,
            coreFingerprint: prints.coreFingerprint,
            browserFingerprint: prints.browserFingerprint,
            browser: context.browser,
            os: context.os,
            deviceType: context.deviceType,
            lastSeenAt: now,
            lastKnownIp: place.ip,
            lastKnownCity: place.city,
            lastKnownState: place.state,
            lastKnownCountry: place.country,
            lastKnownLatitude: place.latitude,
            lastKnownLongitude: place.longitude,
        },
        $inc: { loginCount: 1 },
    };

    if (trust) {
        update.$set.trusted = true;
        update.$set.trustedAt = now;
        update.$set.trustState = 'user';
    } else if (device.isTrustExpired?.(now)) {
        // Re-verified but not re-trusted: the user chose not to tick the box, so
        // the lapsed trust is retired rather than silently renewed.
        update.$set.trusted = false;
        update.$set.trustState = 'expired';
    }

    // Give a device without a name one now — the label is derived, not user
    // input, so it is safe to fill in silently.
    if (!device.deviceName && context.deviceName) {
        update.$set.deviceName = context.deviceName;
    }

    return TrustedDevice.findByIdAndUpdate(device._id, update, { new: true });
};

/** Mark trust as lapsed on a device whose inactivity window has passed. */
export const expireTrust = async (device) => {
    if (!device?.isTrustExpired?.()) return device;
    return TrustedDevice.findByIdAndUpdate(
        device._id,
        { $set: { trusted: false, trustState: 'expired' } },
        { new: true }
    );
};

/** Every place this account is known to sign in from. */
export const knownPlaces = async (userId) => {
    const devices = await TrustedDevice.find({ userId })
        .sort({ lastSeenAt: -1 })
        .limit(50)
        .select('lastKnownCity lastKnownState lastKnownCountry lastKnownLatitude lastKnownLongitude trusted loginCount')
        .lean();

    return devices
        // A device that has never completed a login proves nothing about where
        // the user lives — it may be the attacker's own machine.
        .filter((device) => device.loginCount > 0)
        .map((device) => ({
            city: device.lastKnownCity,
            state: device.lastKnownState,
            country: device.lastKnownCountry,
            latitude: device.lastKnownLatitude,
            longitude: device.lastKnownLongitude,
        }));
};

/** The account-settings list. */
export const listDevices = async (userId) => {
    const devices = await TrustedDevice.find({ userId })
        .sort({ lastSeenAt: -1 })
        .lean();

    const now = new Date();
    const ttlMs = securityConfig.trustedDevice.inactivityDays * 24 * 60 * 60 * 1000;

    return devices.map((device) => {
        const active = Boolean(device.trusted) &&
            now.getTime() - new Date(device.lastSeenAt).getTime() < ttlMs;

        return {
            // The fingerprint hash is never exposed. It is authorisation
            // material for the challenge binding, and an id is all the UI needs.
            id: String(device._id),
            name: device.deviceName || 'Unknown device',
            browser: device.browser,
            os: device.os,
            deviceType: device.deviceType,
            trusted: active,
            trustExpired: Boolean(device.trusted) && !active,
            lastLocation: [device.lastKnownCity, device.lastKnownState, device.lastKnownCountry]
                .filter((part) => part && part !== 'Unknown').join(', ') || null,
            lastIp: device.lastKnownIp,
            firstSeenAt: device.firstSeenAt,
            lastSeenAt: device.lastSeenAt,
            loginCount: device.loginCount,
        };
    });
};

/**
 * Revoke one device.
 *
 * The row is deleted rather than flagged: the user's intent is "this is not my
 * device", and keeping a record keyed to a fingerprint that will match again is
 * how a revoked device quietly becomes a recognised one. The login history
 * keeps the forensic trail.
 *
 * The `userId` filter *is* the authorisation check.
 */
export const revokeDevice = async (userId, deviceId) => {
    const { deletedCount } = await TrustedDevice.deleteOne({ _id: deviceId, userId });
    return deletedCount > 0;
};

/** Revoke every device — the "I have been compromised" lever. */
export const revokeAllDevices = async (userId) => {
    const { deletedCount } = await TrustedDevice.deleteMany({ userId });
    return deletedCount;
};

export const renameDevice = async (userId, deviceId, name) => {
    const device = await TrustedDevice.findOneAndUpdate(
        { _id: deviceId, userId },
        { $set: { deviceName: name } },
        { new: true }
    );
    return Boolean(device);
};

/**
 * Housekeeping.
 *
 * Devices that were seen once, never trusted and never used again are the
 * residue of bots, scanners and one-off browsers. Trusted devices are never
 * touched — a user may keep as many as they like, for as long as they like.
 */
export const pruneStaleDevices = async (userId) => {
    const cutoff = new Date(
        Date.now() - securityConfig.trustedDevice.untrustedRetentionDays * 24 * 60 * 60 * 1000
    );

    const { deletedCount } = await TrustedDevice.deleteMany({
        userId,
        trusted: false,
        loginCount: { $lte: 0 },
        lastSeenAt: { $lt: cutoff },
    });

    return deletedCount;
};

export default {
    findDevice,
    observeDevice,
    confirmLogin,
    expireTrust,
    knownPlaces,
    listDevices,
    revokeDevice,
    revokeAllDevices,
    renameDevice,
    pruneStaleDevices,
};
