import securityConfig from '../config/security.js';
import { PROXIMITY, isAtLeast } from './locationService.js';

/**
 * The risk engine.
 *
 * A pure function: signals in, score and decision out. No database, no request,
 * no clock. That is what makes the policy testable in isolation and what lets a
 * new signal — behavioural analysis, device reputation, a model score — be
 * added by appending a weight to the config and one `add()` call here.
 *
 * ---------------------------------------------------------------------------
 * Two mechanisms, on purpose
 * ---------------------------------------------------------------------------
 * A score alone cannot express a rule that must never be traded away. An
 * unrecognised device (+40) at the user's own desk (-20) scores 20, which is
 * under any sane threshold — and yet "we have never seen this computer before"
 * is precisely when a second factor is worth asking for.
 *
 * So there are hard triggers, which are policy, and there is a score, which is
 * judgement. 2FA is required when *either* fires. Both are configurable, and
 * each hard trigger can be switched off individually for deployments that want
 * the score to have the final word.
 */

export const RISK_SIGNALS = {
    TRUSTED_DEVICE: 'trusted_device',
    KNOWN_LOCATION: 'known_location',
    NEW_DEVICE: 'new_device',
    UNTRUSTED_DEVICE: 'untrusted_device',
    EXPIRED_TRUST: 'expired_trust',
    FINGERPRINT_DRIFT: 'fingerprint_drift',
    NEARBY_LOCATION: 'nearby_location',
    DIFFERENT_CITY: 'different_city',
    DIFFERENT_STATE: 'different_state',
    DIFFERENT_COUNTRY: 'different_country',
    IMPOSSIBLE_TRAVEL: 'impossible_travel',
    SUSPECTED_PROXY: 'suspected_proxy',
    USER_PREFERENCE: 'user_preference_2fa',
};

const PROXIMITY_SIGNAL = {
    [PROXIMITY.NEARBY]: { code: RISK_SIGNALS.NEARBY_LOCATION, weight: 'nearbyLocation' },
    [PROXIMITY.DIFFERENT_CITY]: { code: RISK_SIGNALS.DIFFERENT_CITY, weight: 'differentCity' },
    [PROXIMITY.DIFFERENT_STATE]: { code: RISK_SIGNALS.DIFFERENT_STATE, weight: 'differentState' },
    [PROXIMITY.DIFFERENT_COUNTRY]: { code: RISK_SIGNALS.DIFFERENT_COUNTRY, weight: 'differentCountry' },
};

/**
 * @param {object} input
 * @param {object} input.device            { known, trusted, trustExpired, matchType }
 * @param {object} input.deviceProximity   this login vs the same device's last known place
 * @param {object} input.knownProximity    this login vs every place the user is known at
 * @param {object} input.impossibleTravel  output of locationService.detectImpossibleTravel
 * @param {boolean} input.suspectedProxy
 * @param {boolean} input.userPreference2FA account setting: always ask
 * @param {Array}  input.extraSignals      [{ code, weight, detail, mandatory }] — extension point
 */
export const evaluateLogin = ({
    device = {},
    deviceProximity = { proximity: PROXIMITY.UNKNOWN },
    knownProximity = { proximity: PROXIMITY.UNKNOWN },
    impossibleTravel = { detected: false },
    suspectedProxy = false,
    userPreference2FA = false,
    extraSignals = [],
} = {}) => {
    const { weights, hardTriggers, threshold } = securityConfig.risk;

    const signals = [];
    const mandatory = [];

    const add = (code, weight, detail) => {
        if (!weight) {
            // Zero-weight signals are still recorded: "nearby location" scoring
            // nothing is a fact worth seeing in the history, and a deployment
            // may give it a weight later.
            signals.push({ code, weight: 0, detail });
            return;
        }
        signals.push({ code, weight, detail });
    };

    const demand = (code) => { if (code && !mandatory.includes(code)) mandatory.push(code); };

    // ------------------------------------------------------------------ device
    if (!device.known) {
        add(RISK_SIGNALS.NEW_DEVICE, weights.newDevice, 'Device has not been seen on this account before');
        if (hardTriggers.newDevice) demand(RISK_SIGNALS.NEW_DEVICE);
    } else if (device.trustExpired) {
        add(RISK_SIGNALS.EXPIRED_TRUST, weights.expiredTrust,
            `Trust lapsed after ${securityConfig.trustedDevice.inactivityDays} days of inactivity`);
        if (hardTriggers.expiredTrust) demand(RISK_SIGNALS.EXPIRED_TRUST);
    } else if (!device.trusted) {
        add(RISK_SIGNALS.UNTRUSTED_DEVICE, weights.untrustedDevice, 'Device is known but was never trusted');
        if (hardTriggers.untrustedDevice) demand(RISK_SIGNALS.UNTRUSTED_DEVICE);
    } else {
        add(RISK_SIGNALS.TRUSTED_DEVICE, weights.trustedDevice, 'Recognised, trusted device');
    }

    // A device recognised through the fuzzy path is *probably* the same device.
    // Probably is worth a small penalty, not a challenge.
    if (device.known && device.matchType === 'fuzzy') {
        add(RISK_SIGNALS.FINGERPRINT_DRIFT, weights.fingerprintDrift,
            'Device attributes changed slightly since the last sign-in');
    }

    // ---------------------------------------------------------------- location
    /**
     * A known device is judged against its own history; an unknown one against
     * everywhere the user has ever been.
     *
     * That distinction is the whole multi-device story. A laptop that lives in
     * Delhi turning up in Mumbai is a change *for that laptop* and earns one
     * challenge, even though the account's phone has been in Mumbai for months
     * — which is exactly the behaviour the trust model promises, and it leaves
     * every other device untouched.
     */
    const effective = device.known ? deviceProximity : knownProximity;
    const tier = PROXIMITY_SIGNAL[effective.proximity];

    if (tier) {
        const detail = effective.distanceKm !== null && effective.distanceKm !== undefined
            ? `${Math.round(effective.distanceKm)} km from the last known location`
            : 'Location differs from the last known location';
        add(tier.code, weights[tier.weight], detail);
    }

    if (hardTriggers.significantLocationChange && isAtLeast(effective.proximity, PROXIMITY.DIFFERENT_CITY)) {
        demand(tier?.code);
    }

    // Familiarity is scored independently of the tier above, so a trusted
    // device arriving at a place the account already uses is treated more
    // gently than one arriving somewhere entirely new.
    if (knownProximity.proximity === PROXIMITY.SAME || knownProximity.proximity === PROXIMITY.NEARBY) {
        add(RISK_SIGNALS.KNOWN_LOCATION, weights.knownLocation, 'Location matches a place this account signs in from');
    }

    if (impossibleTravel.detected) {
        add(RISK_SIGNALS.IMPOSSIBLE_TRAVEL, weights.impossibleTravel,
            `${Math.round(impossibleTravel.distanceKm)} km in ${impossibleTravel.hours.toFixed(1)}h`);
        if (hardTriggers.impossibleTravel) demand(RISK_SIGNALS.IMPOSSIBLE_TRAVEL);
    }

    // ----------------------------------------------------------------- network
    if (suspectedProxy) {
        add(RISK_SIGNALS.SUSPECTED_PROXY, weights.suspectedProxy, 'Connection appears to be a VPN, proxy or hosting provider');
        if (hardTriggers.suspectedProxy) demand(RISK_SIGNALS.SUSPECTED_PROXY);
    }

    // ------------------------------------------------------- caller extensions
    for (const signal of extraSignals) {
        if (!signal?.code) continue;
        add(signal.code, Number(signal.weight) || 0, signal.detail);
        if (signal.mandatory) demand(signal.code);
    }

    // The account setting is an override, not a risk signal: the user asked to
    // be challenged every time, so it contributes no score and is never
    // outvoted by one.
    if (userPreference2FA) demand(RISK_SIGNALS.USER_PREFERENCE);

    const rawScore = signals.reduce((total, signal) => total + signal.weight, 0);
    const score = Math.max(0, Math.min(100, rawScore));

    return {
        score,
        rawScore,
        signals,
        reasons: signals.filter((s) => s.weight !== 0).map((s) => s.code),
        mandatory,
        threshold,
        thresholdExceeded: score >= threshold,
        require2FA: mandatory.length > 0 || score >= threshold,
    };
};

export default { evaluateLogin, RISK_SIGNALS };
