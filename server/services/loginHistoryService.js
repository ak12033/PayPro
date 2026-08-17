import LoginHistory from '../models/LoginHistory.js';
import securityConfig from '../config/security.js';

/**
 * The record of where and how an account has been signed into.
 *
 * Two readers with different needs: the risk engine, which asks "where has this
 * user been recently" on the hot path of every login, and the user, who asks
 * "was that me?" from the security centre.
 */

/**
 * Write the login record.
 *
 * Written at *decision* time, not on success — an attempt that stops at the 2FA
 * prompt is exactly the event a user needs to see when reviewing their account,
 * and dropping it would leave the most interesting logins invisible.
 */
export const recordLogin = async ({
    userId,
    deviceId = null,
    location = {},
    context = {},
    deviceTrusted = false,
    risk = {},
    twoFactorRequired = false,
    twoFactorPassed = false,
}) => LoginHistory.create({
    userId,
    deviceId,
    ip: location.ip ?? null,
    city: location.city ?? null,
    state: location.region ?? location.state ?? null,
    country: location.country ?? null,
    latitude: Number.isFinite(location.latitude) ? location.latitude : null,
    longitude: Number.isFinite(location.longitude) ? location.longitude : null,
    isp: location.isp ?? null,
    suspectedProxy: Boolean(location.suspectedProxy),
    userAgent: context.userAgent ?? null,
    browser: context.browser ?? null,
    os: context.os ?? null,
    deviceType: context.deviceType ?? null,
    screenResolution: context.screenResolution ?? null,
    language: context.language ?? null,
    timezone: context.timezone ?? null,
    deviceTrusted,
    loginTime: new Date(),
    riskScore: risk.score ?? 0,
    riskReasons: risk.reasons ?? [],
    twoFactorRequired,
    twoFactorPassed,
});

/** Close the loop once a challenge is answered. */
export const markTwoFactorPassed = async (loginHistoryId) => {
    if (!loginHistoryId) return null;
    return LoginHistory.findByIdAndUpdate(
        loginHistoryId,
        { $set: { twoFactorPassed: true } },
        { new: true }
    );
};

/** The most recent *completed* login, used for cross-device travel checks. */
export const lastSuccessfulLogin = async (userId, { excludeDeviceId = null } = {}) => {
    const query = {
        userId,
        $or: [{ twoFactorRequired: false }, { twoFactorPassed: true }],
    };
    if (excludeDeviceId) query.deviceId = { $ne: excludeDeviceId };

    return LoginHistory.findOne(query).sort({ loginTime: -1 }).lean();
};

/** The same, for one device. */
export const lastSuccessfulLoginForDevice = async (userId, deviceId) => {
    if (!deviceId) return null;
    return LoginHistory.findOne({
        userId,
        deviceId,
        $or: [{ twoFactorRequired: false }, { twoFactorPassed: true }],
    }).sort({ loginTime: -1 }).lean();
};

/**
 * Places this account has actually signed in from.
 *
 * Only completed logins count. Counting challenged-but-unanswered attempts
 * would let an attacker establish their own location as "known" simply by
 * failing to authenticate from it a few times.
 */
export const knownPlaces = async (userId) => {
    const { historyWindowDays, historySampleSize } = securityConfig.location;
    const since = new Date(Date.now() - historyWindowDays * 24 * 60 * 60 * 1000);

    const entries = await LoginHistory.find({
        userId,
        loginTime: { $gte: since },
        $or: [{ twoFactorRequired: false }, { twoFactorPassed: true }],
    })
        .sort({ loginTime: -1 })
        .limit(historySampleSize)
        .select('city state country latitude longitude')
        .lean();

    return entries;
};

/** Paginated history for the security centre. */
export const getHistory = async (userId, { page = 1, limit = 20 } = {}) => {
    const [entries, total] = await Promise.all([
        LoginHistory.find({ userId })
            .sort({ loginTime: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('deviceId', 'deviceName browser os deviceType trusted')
            .lean(),
        LoginHistory.countDocuments({ userId }),
    ]);

    return {
        entries: entries.map((entry) => ({
            id: String(entry._id),
            device: entry.deviceId?.deviceName
                || [entry.browser, entry.os].filter(Boolean).join(' on ')
                || 'Unknown device',
            deviceTrusted: entry.deviceTrusted,
            location: [entry.city, entry.state, entry.country]
                .filter((part) => part && part !== 'Unknown').join(', ') || 'Unknown location',
            ip: entry.ip,
            loginTime: entry.loginTime,
            riskScore: entry.riskScore,
            riskReasons: entry.riskReasons,
            twoFactorRequired: entry.twoFactorRequired,
            twoFactorPassed: entry.twoFactorPassed,
            suspectedProxy: entry.suspectedProxy,
        })),
        total,
        page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
};

export default {
    recordLogin,
    markTwoFactorPassed,
    lastSuccessfulLogin,
    lastSuccessfulLoginForDevice,
    knownPlaces,
    getHistory,
};
