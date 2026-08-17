import crypto from 'crypto';
import config from './env.js';

/**
 * Login-security tuning.
 *
 * Every knob the risk engine reads lives here, so the policy can be adjusted
 * without touching the code that applies it. Nothing in the services below
 * hard-codes a weight, a radius or a threshold.
 *
 * Numbers can be overridden per environment. That matters operationally: the
 * right threshold for a wallet holding ₹500 is not the right threshold for one
 * holding ₹5,00,000, and the only way to find it is to move it while watching
 * the challenge rate.
 */

const num = (key, fallback) => {
    const raw = process.env[key];
    if (raw === undefined || raw === '') return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const bool = (key, fallback) => {
    const raw = process.env[key];
    if (raw === undefined || raw === '') return fallback;
    return raw === 'true' || raw === '1';
};

/**
 * Pepper for device fingerprint hashing.
 *
 * Fingerprints are hashed with a keyed HMAC rather than a bare SHA-256. A bare
 * digest of a low-entropy value (browser + OS + screen size) is trivially
 * reversible by enumeration — an attacker with a copy of the database could
 * rebuild the plaintext for every row in seconds and learn exactly what device
 * each user signs in from. A server-side key makes the stored value useless on
 * its own.
 *
 * Derived from JWT_SECRET when a dedicated key is not configured, so the system
 * is secure by default rather than secure only if someone remembers to set a
 * second variable. Rotating either value invalidates existing fingerprints,
 * which degrades gracefully: users are challenged once and re-trust.
 */
const fingerprintPepper =
    process.env.DEVICE_FINGERPRINT_SECRET ||
    crypto.createHash('sha256').update(`device-fingerprint:${config.JWT_SECRET || ''}`).digest('hex');

export const securityConfig = {
    fingerprint: {
        pepper: fingerprintPepper,
        /**
         * Bumped when the set of components that make up a fingerprint changes.
         * Old hashes stop matching by construction, which is the correct
         * behaviour — a changed recipe means the old value described something
         * else.
         */
        version: 'v1',
    },

    location: {
        /**
         * Two logins within this radius are "the same place".
         *
         * IP geolocation resolves to a city centroid, not to a street, and the
         * same broadband connection can resolve to a neighbouring city after a
         * DHCP lease change. Anything tighter than city scale generates
         * challenges for users who never left the room.
         */
        sameRadiusKm: num('LOGIN_SAME_LOCATION_RADIUS_KM', 100),
        /**
         * Still plausibly a commute or a day trip. Scored as safe, but no longer
         * counted as the same place.
         */
        nearbyRadiusKm: num('LOGIN_NEARBY_RADIUS_KM', 200),
        /** How far back login history is consulted when deciding "known place". */
        historyWindowDays: num('LOGIN_HISTORY_WINDOW_DAYS', 180),
        /** How many recent logins to consider. Bounds the query, not the policy. */
        historySampleSize: num('LOGIN_HISTORY_SAMPLE_SIZE', 50),
    },

    impossibleTravel: {
        /** Faster than a commercial airliner, including airport time. */
        maxSpeedKmph: num('LOGIN_MAX_TRAVEL_SPEED_KMPH', 900),
        /**
         * Below this distance the geolocation error bar is larger than the
         * signal, so speed is meaningless. Without a floor, two logins from the
         * same building 20 seconds apart that resolve to centroids 30 km apart
         * look like Mach 4.
         */
        minDistanceKm: num('LOGIN_IMPOSSIBLE_TRAVEL_MIN_KM', 100),
        /** Guards against a divide-by-zero on two logins in the same second. */
        minElapsedMinutes: num('LOGIN_IMPOSSIBLE_TRAVEL_MIN_MINUTES', 1),
        /**
         * Whether to compare a login against the user's other devices, not just
         * against the same device's own history.
         *
         * Off means a user carrying a phone and a laptop in two cities is never
         * flagged. On means the check also catches a brand-new device appearing
         * implausibly far from the last known session, at the cost of some noise
         * for genuinely multi-city users.
         */
        crossDevice: bool('LOGIN_IMPOSSIBLE_TRAVEL_CROSS_DEVICE', true),
    },

    trustedDevice: {
        /**
         * Trust decays. A device not used for this long is treated as untrusted
         * until it is verified again — a laptop sold, lost or left in an office
         * drawer should not carry an indefinite pass.
         */
        inactivityDays: num('TRUSTED_DEVICE_INACTIVITY_DAYS', 90),
        /**
         * Minimum facet score at which a drifted fingerprint is accepted as the
         * same device. See deviceFingerprintService for what the facets are.
         */
        fuzzyMatchThreshold: num('DEVICE_FUZZY_MATCH_THRESHOLD', 0.85),
        /**
         * Housekeeping for device rows that were seen once and never trusted —
         * the residue of bot traffic and one-off browsers. Trusted devices are
         * never pruned; a user may keep as many as they like.
         */
        untrustedRetentionDays: num('UNTRUSTED_DEVICE_RETENTION_DAYS', 30),
    },

    risk: {
        /** Score at or above which a second factor is demanded. */
        threshold: num('LOGIN_RISK_THRESHOLD', 50),

        /**
         * Signal weights. Positive adds risk, negative removes it. The final
         * score is clamped to 0-100.
         *
         * Adding a new signal is a matter of appending a weight here and a
         * `signal()` call in riskEvaluationService — behavioural analysis,
         * device reputation or a model score all slot in the same way.
         */
        weights: {
            trustedDevice: num('RISK_W_TRUSTED_DEVICE', -30),
            knownLocation: num('RISK_W_KNOWN_LOCATION', -20),
            newDevice: num('RISK_W_NEW_DEVICE', 40),
            /** Seen before, but the user never vouched for it. */
            untrustedDevice: num('RISK_W_UNTRUSTED_DEVICE', 20),
            /** Trust lapsed through inactivity. */
            expiredTrust: num('RISK_W_EXPIRED_TRUST', 25),
            /** Fingerprint drifted but still resolved to a known device. */
            fingerprintDrift: num('RISK_W_FINGERPRINT_DRIFT', 10),
            /** Location tiers are mutually exclusive: only the worst one applies. */
            nearbyLocation: num('RISK_W_NEARBY_LOCATION', 0),
            differentCity: num('RISK_W_DIFFERENT_CITY', 20),
            differentState: num('RISK_W_DIFFERENT_STATE', 30),
            differentCountry: num('RISK_W_DIFFERENT_COUNTRY', 40),
            impossibleTravel: num('RISK_W_IMPOSSIBLE_TRAVEL', 50),
            suspectedProxy: num('RISK_W_SUSPECTED_PROXY', 30),
        },

        /**
         * Conditions that demand a second factor no matter what the arithmetic
         * says.
         *
         * The score alone cannot express "never skip 2FA for an unrecognised
         * device": a new device (+40) at a known location (-20) lands at 20,
         * comfortably under the threshold. Both mechanisms are kept because they
         * answer different questions — the rules encode policy that must not be
         * negotiable, the score handles everything gradual.
         */
        hardTriggers: {
            newDevice: bool('RISK_HARD_NEW_DEVICE', true),
            untrustedDevice: bool('RISK_HARD_UNTRUSTED_DEVICE', true),
            expiredTrust: bool('RISK_HARD_EXPIRED_TRUST', true),
            significantLocationChange: bool('RISK_HARD_LOCATION_CHANGE', true),
            impossibleTravel: bool('RISK_HARD_IMPOSSIBLE_TRAVEL', true),
            suspectedProxy: bool('RISK_HARD_SUSPECTED_PROXY', false),
        },
    },

    network: {
        /**
         * Substrings that mark an ISP as a hosting provider, VPN exit or proxy.
         *
         * A heuristic, and deliberately a conservative one: a false positive
         * here challenges a real user. Consumer mobile and broadband carriers
         * must never appear in this list. Swap in a commercial IP-reputation
         * feed by passing `reputation` into evaluateLogin — the engine treats it
         * as just another signal.
         */
        proxyKeywords: (process.env.PROXY_ISP_KEYWORDS || [
            'vpn', 'proxy', 'tor exit', 'hosting', 'datacenter', 'data center',
            'colocation', 'digitalocean', 'linode', 'ovh', 'hetzner', 'vultr',
            'm247', 'nordvpn', 'expressvpn', 'mullvad', 'surfshark',
            'private internet access', 'amazon technologies', 'amazon.com',
            'microsoft azure', 'google cloud', 'oracle cloud',
        ].join(',')).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    },
};

export default securityConfig;
