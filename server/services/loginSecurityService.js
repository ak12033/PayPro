import User from '../models/User.js';
import TrustedDevice from '../models/TrustedDevice.js';
import { buildDeviceContext, computeFingerprints } from './deviceFingerprintService.js';
import {
    resolveLocation,
    compareLocations,
    compareAgainstKnown,
    detectImpossibleTravel,
    describePlace,
    toStoredPlace,
    PROXIMITY,
} from './locationService.js';
import { evaluateLogin, RISK_SIGNALS } from './riskEvaluationService.js';
import { isStaffRole } from './totpService.js';
import * as devices from './trustedDeviceService.js';
import * as history from './loginHistoryService.js';
import securityConfig from '../config/security.js';
import logger from '../utils/logger.js';

/**
 * The orchestrator.
 *
 * Wires the single-purpose services into the two operations authentication
 * actually needs: *assess* a login attempt, and *finalise* one that succeeded.
 * It holds no policy of its own — every threshold, weight and rule lives in
 * config/security.js, and every decision is made by riskEvaluationService.
 *
 * Keeping this seam thin is what lets the controller stay readable: the login
 * handler asks one question ("is this login safe?") and acts on one answer.
 */

/** Shape of a device's last known place, for comparison against the current one. */
const devicePlace = (device) => (device ? {
    city: device.lastKnownCity,
    state: device.lastKnownState,
    country: device.lastKnownCountry,
    latitude: device.lastKnownLatitude,
    longitude: device.lastKnownLongitude,
} : null);

/**
 * Assess a login that has already passed the password check.
 *
 * Nothing here mutates trust or moves a device's location. The only write is
 * the first sighting of a genuinely new device (so the login history has
 * something to reference) and the login history row itself. Trust changes only
 * in `finalizeLogin`, only after full authentication — which is what makes an
 * abandoned or failed challenge harmless.
 */
export const assessLogin = async ({ user, req, declaredDevice }) => {
    const context = buildDeviceContext(req, declaredDevice);
    const prints = computeFingerprints(user._id, context);

    // Server-side geolocation only. `req.currentLocation` is populated by the
    // location middleware from req.ip; the fallback keeps this service usable
    // from routes that do not mount it.
    const location = req.currentLocation?.ip
        ? req.currentLocation
        : await resolveLocation(req.ip);

    const match = await devices.findDevice(user._id, prints);
    const now = new Date();

    // A device whose trust has lapsed is marked as such on sight, so the state
    // in the database matches the decision being made about it.
    const trustExpired = Boolean(match.device?.isTrustExpired?.(now));
    if (trustExpired) await devices.expireTrust(match.device);

    const deviceKnown = Boolean(match.device);
    const trustActive = Boolean(match.device?.isTrustActive?.(now));

    // ------------------------------------------------------------- geography
    const deviceProximity = deviceKnown
        ? compareLocations(devicePlace(match.device), location)
        : { proximity: PROXIMITY.UNKNOWN, distanceKm: null };

    /**
     * "Known place" is the union of everywhere the account has completed a
     * login and everywhere its devices were last used. Both are needed: history
     * covers places whose device has since been revoked, devices cover places
     * older than the history window.
     */
    const [historyPlaces, devicePlaces] = await Promise.all([
        history.knownPlaces(user._id),
        devices.knownPlaces(user._id),
    ]);
    const knownProximity = compareAgainstKnown(location, [...historyPlaces, ...devicePlaces]);

    const travel = await assessTravel({ user, device: match.device, location, now });

    // ------------------------------------------------------------------ risk
    const risk = evaluateLogin({
        device: {
            known: deviceKnown,
            trusted: trustActive,
            trustExpired,
            matchType: match.matchType,
        },
        deviceProximity,
        knownProximity,
        impossibleTravel: travel,
        suspectedProxy: Boolean(location.suspectedProxy),
        userPreference2FA: Boolean(user.preferences?.twoFactorAuth),
        /**
         * Staff sign in to a console that can move other people's money, so a
         * trusted device is not an exemption for them: every sign-in asks for
         * the authenticator. Staff without one yet sign in as usual and are
         * then held at enrolment by `requireStaffTotp`.
         */
        extraSignals: isStaffRole(user.role) && user.totp?.enabled
            ? [{ code: RISK_SIGNALS.STAFF_ACCOUNT, weight: 0, detail: 'Staff account', mandatory: true }]
            : [],
    });

    // Register the sighting only now, so the risk engine judged the device as it
    // was *before* this attempt.
    const observed = deviceKnown
        ? match
        : await devices.observeDevice({ userId: user._id, prints, context, location });

    const entry = await history.recordLogin({
        userId: user._id,
        deviceId: observed.device?._id ?? null,
        location,
        context,
        deviceTrusted: trustActive,
        risk,
        twoFactorRequired: risk.require2FA,
        twoFactorPassed: false,
    });

    return {
        context,
        prints,
        location,
        device: observed.device,
        deviceKnown,
        deviceTrusted: trustActive,
        matchType: match.matchType,
        matchScore: match.matchScore,
        proximity: deviceKnown ? deviceProximity : knownProximity,
        impossibleTravel: travel,
        risk,
        loginHistoryId: entry?._id ?? null,
        /** Ready-made copy for notifications and the 2FA screen. */
        place: describePlace(location),
    };
};

/**
 * Impossible travel, evaluated against the right baseline.
 *
 * For a device we recognise, the baseline is that device's own last login. That
 * is the only comparison that survives a multi-device account: a phone in
 * Mumbai and a laptop in Delhi are not evidence of teleportation, and treating
 * them as such would challenge every second device the user owns.
 *
 * For an unrecognised device there is no per-device baseline, so the account's
 * most recent completed login is used instead — configurable, because it is the
 * one check that can misfire for people who genuinely travel with several
 * devices.
 */
const assessTravel = async ({ user, device, location, now }) => {
    const none = { detected: false, distanceKm: null, hours: null, speedKmph: null };

    if (device) {
        const previous = await history.lastSuccessfulLoginForDevice(user._id, device._id);
        const from = previous ?? devicePlace(device);
        const at = previous?.loginTime ?? device.lastSeenAt;
        if (!from || !at || device.loginCount <= 0) return none;
        return detectImpossibleTravel(from, location, { previousAt: at, currentAt: now });
    }

    if (!securityConfig.impossibleTravel.crossDevice) return none;

    const previous = await history.lastSuccessfulLogin(user._id);
    if (!previous) return none;
    return detectImpossibleTravel(previous, location, { previousAt: previous.loginTime, currentAt: now });
};

/**
 * Complete a login: move the device's location, count it, optionally trust it.
 *
 * Called from exactly two places — the direct login path when no challenge was
 * needed, and the OTP path once a challenge has been answered. Both go through
 * here so a trusted device's location is updated in precisely one way, and only
 * after the user has proved who they are.
 */
export const finalizeLogin = async ({
    user,
    device,
    prints,
    context,
    location,
    trustDevice = false,
    loginHistoryId = null,
}) => {
    const updated = device
        ? await devices.confirmLogin({ device, prints, context, location, trust: trustDevice })
        : null;

    await User.updateOne(
        { _id: user._id },
        {
            $set: {
                lastLoginLocation: { ...toStoredPlace(location), isp: location.isp ?? null },
                failedLoginAttempts: 0,
                lockUntil: null,
            },
        }
    );

    if (loginHistoryId) await history.markTwoFactorPassed(loginHistoryId);

    // Best-effort housekeeping; a failure here must never affect the login.
    devices.pruneStaleDevices(user._id).catch((err) =>
        logger.warn('Device pruning failed', { error: err.message })
    );

    return updated;
};

/**
 * Identify the device making a request, without touching the database.
 *
 * Needed before a challenge is verified: the stored challenge is bound to a
 * fingerprint, so the fingerprint has to be in hand before the code is checked
 * — and checking it must not require reading the challenge first.
 */
export const describeRequestDevice = ({ user, req, declaredDevice }) => {
    const context = buildDeviceContext(req, declaredDevice);
    return { context, prints: computeFingerprints(user._id, context) };
};

/**
 * Re-derive the device for a request that is completing a challenge.
 *
 * The challenge carries the device it was issued to; this resolves that id back
 * to a row — scoped to the user, so a forged id cannot reach another account's
 * device.
 */
export const resolveChallengeDevice = async ({ user, req, context, prints, deviceId }) => {
    const location = req.currentLocation?.ip
        ? req.currentLocation
        : await resolveLocation(req.ip);

    let device = deviceId && /^[0-9a-fA-F]{24}$/.test(String(deviceId))
        ? await TrustedDevice.findOne({ _id: deviceId, userId: user._id })
        : null;

    // The row may have been pruned or revoked between the two requests; fall
    // back to matching on the fingerprint, and create it if it is genuinely new.
    if (!device) {
        const observed = await devices.observeDevice({ userId: user._id, prints, context, location });
        device = observed.device;
    }

    return { context, prints, location, device };
};

/**
 * Enrol the device an account was created from, and trust it.
 *
 * Someone who has just proved control of the email address, chosen the
 * password and created the account is as verified as the flow can make them.
 * Challenging that same browser on its very next login would be theatre — and
 * it is the reason a first-time user used to be asked for an emailed code
 * roughly one minute after registering.
 */
export const enrollDevice = async ({ user, req, declaredDevice }) => {
    const { context, prints } = describeRequestDevice({ user, req, declaredDevice });
    const location = req.currentLocation?.ip
        ? req.currentLocation
        : await resolveLocation(req.ip);

    const { device } = await devices.observeDevice({ userId: user._id, prints, context, location });

    await history.recordLogin({
        userId: user._id,
        deviceId: device?._id ?? null,
        location,
        context,
        deviceTrusted: true,
        risk: { score: 0, reasons: ['registration'] },
        twoFactorRequired: false,
    });

    await devices.confirmLogin({ device, prints, context, location, trust: true });

    return { device, context, prints, location };
};

export default {
    assessLogin,
    finalizeLogin,
    describeRequestDevice,
    resolveChallengeDevice,
    enrollDevice,
};
