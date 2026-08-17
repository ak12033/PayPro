import crypto from 'crypto';
import securityConfig from '../config/security.js';
import { parseUserAgent, describeDevice } from '../utils/userAgent.js';
import { asString } from '../utils/sanitize.js';

/**
 * Device identity.
 *
 * Turns the request plus a small set of client-declared browser attributes into
 * three keyed hashes, and scores how well an incoming device matches a stored
 * one. It knows nothing about users, locations, risk or 2FA.
 *
 * ---------------------------------------------------------------------------
 * Why three hashes instead of one
 * ---------------------------------------------------------------------------
 * A single fingerprint is brittle in exactly the way that hurts most: any one
 * component changing — plugging in an external monitor, switching the interface
 * language, crossing a time zone — produces a completely different digest, the
 * device reads as brand new, and the user is challenged for doing nothing at
 * all. Users who are challenged for nothing stop reading challenges.
 *
 * So the components are hashed three times over different subsets:
 *
 *   full     everything. An exact match is conclusive.
 *   core     the machine underneath: OS family, platform, CPU count, memory,
 *            touch support. Survives changing browser, screen and time zone.
 *   browser  the software on top: browser family, OS family, device type,
 *            language. Survives changing machine.
 *
 * Matching `core` *and* `browser` while `full` differs is the signature of
 * ordinary drift — same browser, same machine, something cosmetic moved — and
 * is accepted as the same device. Matching only one of them is not: a new
 * browser on the same laptop (core only) and the same browser on a different
 * laptop (browser only) are both genuinely new devices, and both get
 * challenged.
 *
 * Screen resolution and time zone appear only in `full`. Both change for
 * completely innocent reasons — a docking station, a flight — and neither
 * should be able to unseat a device on its own.
 *
 * Versions are excluded everywhere. See utils/userAgent.js.
 *
 * ---------------------------------------------------------------------------
 * On trusting the client
 * ---------------------------------------------------------------------------
 * The attribute bundle comes from the browser and is therefore forgeable. That
 * is acceptable here and only here: forging it lets an attacker *impersonate a
 * device they already know about*, which requires knowing the victim's exact
 * hardware profile, and it never grants trust on its own — the device must
 * already be marked trusted by a completed 2FA. Location, by contrast, is never
 * taken from the client under any circumstances.
 */

const { pepper, version } = securityConfig.fingerprint;

const hash = (userId, label, value) =>
    crypto.createHmac('sha256', pepper)
        .update(`${version}|${label}|${userId}|${value}`)
        .digest('hex');

/** Normalise one declared attribute into a short, comparable token. */
const token = (value, maxLength = 64) => {
    if (value === null || value === undefined) return '?';
    if (typeof value === 'boolean') return value ? '1' : '0';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '?';
    const clean = asString(String(value), { maxLength });
    return clean ? clean.toLowerCase() : '?';
};

/**
 * Build the device context for a request.
 *
 * `declared` is the (optional) `deviceInfo` object posted by the client. Every
 * field is optional — a client that sends nothing still produces a usable, if
 * coarser, fingerprint from the user agent alone, which is what keeps API
 * clients and older browsers working.
 */
export const buildDeviceContext = (req, declared = {}) => {
    const source = declared && typeof declared === 'object' ? declared : {};
    const { userAgent, browser, os, deviceType } = parseUserAgent(req.headers?.['user-agent']);

    return {
        userAgent,
        browser,
        os,
        deviceType,
        deviceName: describeDevice({ browser, os, deviceType }),
        // Declared, and used only for identity — never for geolocation.
        platform: token(source.platform, 40),
        screenResolution: token(source.screenResolution, 20),
        colorDepth: token(source.colorDepth, 4),
        timezone: token(source.timezone, 60),
        language: token(source.language, 20),
        hardwareConcurrency: token(source.hardwareConcurrency, 4),
        deviceMemory: token(source.deviceMemory, 8),
        touchSupport: token(source.touchSupport, 6),
    };
};

/**
 * Hash a device context for one user.
 *
 * Scoped per user, so the same laptop shared by two accounts produces two
 * unrelated hashes and the database cannot be used to correlate accounts by
 * hardware.
 */
export const computeFingerprints = (userId, context) => {
    const id = String(userId);
    const c = context;

    const full = [
        c.browser, c.os, c.deviceType, c.platform, c.screenResolution,
        c.colorDepth, c.timezone, c.language, c.hardwareConcurrency,
        c.deviceMemory, c.touchSupport,
    ].map((v) => token(v)).join('|');

    const core = [
        c.os, c.deviceType, c.platform, c.hardwareConcurrency,
        c.deviceMemory, c.touchSupport,
    ].map((v) => token(v)).join('|');

    const browser = [c.browser, c.os, c.deviceType, c.language]
        .map((v) => token(v)).join('|');

    return {
        deviceFingerprint: hash(id, 'full', full),
        coreFingerprint: hash(id, 'core', core),
        browserFingerprint: hash(id, 'browser', browser),
    };
};

/**
 * How strongly an incoming fingerprint matches a stored device: 0 to 1.
 *
 * The intermediate values are what make the system tolerant. 0.85 (core and
 * browser agree, full does not) is drift. 0.5 and 0.35 are different devices
 * that happen to share a machine or a browser, and are deliberately below the
 * default acceptance threshold.
 */
export const scoreMatch = (device, prints) => {
    if (!device) return 0;
    if (device.deviceFingerprint === prints.deviceFingerprint) return 1;

    const coreMatch = device.coreFingerprint === prints.coreFingerprint;
    const browserMatch = device.browserFingerprint === prints.browserFingerprint;

    if (coreMatch && browserMatch) return 0.85;
    if (coreMatch) return 0.5;
    if (browserMatch) return 0.35;
    return 0;
};

/** Timing-safe comparison for fingerprints used as authorisation material. */
export const fingerprintsEqual = (a, b) => {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

export default { buildDeviceContext, computeFingerprints, scoreMatch, fingerprintsEqual };
