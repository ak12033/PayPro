import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import securityConfig from '../config/security.js';
import {
    compareLocations,
    compareAgainstKnown,
    detectImpossibleTravel,
    distanceKm,
    isSuspectedProxy,
    PROXIMITY,
} from '../services/locationService.js';
import { evaluateLogin, RISK_SIGNALS } from '../services/riskEvaluationService.js';
import {
    buildDeviceContext,
    computeFingerprints,
    scoreMatch,
} from '../services/deviceFingerprintService.js';

/**
 * Unit coverage for the decision layer.
 *
 * These three services are pure — no database, no request, no clock — which is
 * the point of separating them. The policy can be exercised directly here,
 * across every combination, in milliseconds; the integration suite then only
 * has to prove the wiring.
 */

const PLACES = {
    delhi: { city: 'New Delhi', region: 'Delhi', country: 'India', latitude: 28.6139, longitude: 77.209 },
    noida: { city: 'Noida', region: 'Uttar Pradesh', country: 'India', latitude: 28.5355, longitude: 77.391 },
    jaipur: { city: 'Jaipur', region: 'Rajasthan', country: 'India', latitude: 26.9124, longitude: 75.7873 },
    mumbai: { city: 'Mumbai', region: 'Maharashtra', country: 'India', latitude: 19.076, longitude: 72.8777 },
    london: { city: 'London', region: 'England', country: 'United Kingdom', latitude: 51.5074, longitude: -0.1278 },
    unknown: { city: 'Unknown', region: null, country: null, latitude: null, longitude: null },
};

describe('locationService.distanceKm', () => {
    it('measures the great-circle distance between two cities', () => {
        // Delhi to Mumbai is ~1150 km.
        expect(distanceKm(PLACES.delhi, PLACES.mumbai)).toBeGreaterThan(1100);
        expect(distanceKm(PLACES.delhi, PLACES.mumbai)).toBeLessThan(1200);
    });

    it('returns null rather than guessing when coordinates are missing', () => {
        expect(distanceKm(PLACES.delhi, PLACES.unknown)).toBeNull();
    });
});

describe('locationService.compareLocations', () => {
    it('treats a neighbouring city inside the radius as the same place', () => {
        // Noida is a different city *and a different state*, 25 km away. An
        // administrative comparison would call this a state change; a distance
        // comparison correctly calls it the same place.
        expect(compareLocations(PLACES.delhi, PLACES.noida).proximity).toBe(PROXIMITY.SAME);
    });

    it('flags another state as a state change', () => {
        expect(compareLocations(PLACES.delhi, PLACES.jaipur).proximity).toBe(PROXIMITY.DIFFERENT_STATE);
    });

    it('flags another country as a country change', () => {
        expect(compareLocations(PLACES.delhi, PLACES.london).proximity).toBe(PROXIMITY.DIFFERENT_COUNTRY);
    });

    it('falls back to names when the provider returns no coordinates', () => {
        const from = { city: 'New Delhi', region: 'Delhi', country: 'India' };
        const to = { city: 'New Delhi', region: 'Delhi', country: 'India' };
        expect(compareLocations(from, to).proximity).toBe(PROXIMITY.SAME);
        expect(compareLocations(from, { city: 'Paris', country: 'France' }).proximity)
            .toBe(PROXIMITY.DIFFERENT_COUNTRY);
    });

    it('reports unknown when there is nothing to compare', () => {
        expect(compareLocations(PLACES.unknown, PLACES.unknown).proximity).toBe(PROXIMITY.UNKNOWN);
    });

    it('respects a reconfigured radius', () => {
        const original = securityConfig.location.sameRadiusKm;
        securityConfig.location.sameRadiusKm = 10;
        try {
            expect(compareLocations(PLACES.delhi, PLACES.noida).proximity).not.toBe(PROXIMITY.SAME);
        } finally {
            securityConfig.location.sameRadiusKm = original;
        }
    });
});

describe('locationService.compareAgainstKnown', () => {
    it('picks the closest known place, not the most recent one', () => {
        // A user whose laptop lives in Delhi and phone in Mumbai is familiar
        // with both. Signing in from Mumbai must read as familiar even though
        // Delhi may be the more recently used device.
        const result = compareAgainstKnown(PLACES.mumbai, [PLACES.delhi, PLACES.mumbai]);
        expect(result.proximity).toBe(PROXIMITY.SAME);
    });

    it('reports the least-bad tier when nothing is close', () => {
        const result = compareAgainstKnown(PLACES.london, [PLACES.delhi, PLACES.mumbai]);
        expect(result.proximity).toBe(PROXIMITY.DIFFERENT_COUNTRY);
    });
});

describe('locationService.detectImpossibleTravel', () => {
    it('flags Delhi to London in one hour', () => {
        const result = detectImpossibleTravel(PLACES.delhi, PLACES.london, {
            previousAt: new Date('2026-01-01T10:00:00Z'),
            currentAt: new Date('2026-01-01T11:00:00Z'),
        });
        expect(result.detected).toBe(true);
        expect(result.speedKmph).toBeGreaterThan(900);
    });

    it('accepts the same journey over a plausible flight time', () => {
        const result = detectImpossibleTravel(PLACES.delhi, PLACES.london, {
            previousAt: new Date('2026-01-01T10:00:00Z'),
            currentAt: new Date('2026-01-01T22:00:00Z'),
        });
        expect(result.detected).toBe(false);
    });

    it('ignores short hops, where geolocation error dwarfs the signal', () => {
        // Two sign-ins from the same building seconds apart can resolve to
        // centroids tens of km apart. Without the distance floor that reads as
        // supersonic travel and challenges a user who never moved.
        const result = detectImpossibleTravel(PLACES.delhi, PLACES.noida, {
            previousAt: new Date('2026-01-01T10:00:00Z'),
            currentAt: new Date('2026-01-01T10:00:20Z'),
        });
        expect(result.detected).toBe(false);
    });

    it('does not read a clock skew as instant travel', () => {
        const result = detectImpossibleTravel(PLACES.delhi, PLACES.london, {
            previousAt: new Date('2026-01-01T12:00:00Z'),
            currentAt: new Date('2026-01-01T10:00:00Z'),
        });
        expect(result.detected).toBe(false);
    });

    it('says nothing when either side has no coordinates', () => {
        const result = detectImpossibleTravel(PLACES.unknown, PLACES.london, {
            previousAt: new Date('2026-01-01T10:00:00Z'),
        });
        expect(result.detected).toBe(false);
    });
});

describe('locationService.isSuspectedProxy', () => {
    it('recognises VPN and hosting providers', () => {
        expect(isSuspectedProxy('NordVPN')).toBe(true);
        expect(isSuspectedProxy('DigitalOcean, LLC')).toBe(true);
    });

    it('leaves consumer carriers alone', () => {
        // A false positive here challenges a real user on their home broadband,
        // which is the expensive kind of mistake.
        expect(isSuspectedProxy('Reliance Jio Infocomm Limited')).toBe(false);
        expect(isSuspectedProxy('Bharti Airtel Ltd')).toBe(false);
    });
});

describe('deviceFingerprintService', () => {
    const req = (userAgent) => ({ headers: { 'user-agent': userAgent } });

    const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const CHROME_WIN_UPDATED = CHROME_WIN.replace('Chrome/120.0.0.0', 'Chrome/131.0.0.0');
    const FIREFOX_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0';
    const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';

    const LAPTOP = {
        platform: 'Win32',
        screenResolution: '1920x1080',
        colorDepth: 24,
        timezone: 'Asia/Kolkata',
        language: 'en-US',
        hardwareConcurrency: 8,
        deviceMemory: 8,
        touchSupport: false,
    };

    const print = (userAgent, declared, userId = 'user-1') =>
        computeFingerprints(userId, buildDeviceContext(req(userAgent), declared));

    it('parses browser, OS and device type from the user agent', () => {
        const context = buildDeviceContext(req(SAFARI_IPHONE), {});
        expect(context.browser).toBe('Safari');
        expect(context.os).toBe('iOS');
        expect(context.deviceType).toBe('mobile');
    });

    it('is stable across a browser update', () => {
        // Chrome ships every four weeks. A fingerprint that includes the version
        // would challenge every user on that cadence.
        expect(print(CHROME_WIN, LAPTOP).deviceFingerprint)
            .toBe(print(CHROME_WIN_UPDATED, LAPTOP).deviceFingerprint);
    });

    it('scopes the hash to the user, so two accounts on one laptop cannot be linked', () => {
        expect(print(CHROME_WIN, LAPTOP, 'user-1').deviceFingerprint)
            .not.toBe(print(CHROME_WIN, LAPTOP, 'user-2').deviceFingerprint);
    });

    it('never stores anything resembling the raw attributes', () => {
        const prints = print(CHROME_WIN, LAPTOP);
        expect(prints.deviceFingerprint).toMatch(/^[0-9a-f]{64}$/);
        expect(prints.deviceFingerprint).not.toContain('Win32');
    });

    describe('match scoring', () => {
        const stored = () => {
            const p = print(CHROME_WIN, LAPTOP);
            return {
                deviceFingerprint: p.deviceFingerprint,
                coreFingerprint: p.coreFingerprint,
                browserFingerprint: p.browserFingerprint,
            };
        };

        it('is conclusive for an identical device', () => {
            expect(scoreMatch(stored(), print(CHROME_WIN, LAPTOP))).toBe(1);
        });

        it('tolerates a docked external monitor', () => {
            const drifted = print(CHROME_WIN, { ...LAPTOP, screenResolution: '2560x1440' });
            const score = scoreMatch(stored(), drifted);
            expect(score).toBeGreaterThanOrEqual(securityConfig.trustedDevice.fuzzyMatchThreshold);
        });

        it('tolerates a time zone change while travelling', () => {
            const drifted = print(CHROME_WIN, { ...LAPTOP, timezone: 'Europe/London' });
            expect(scoreMatch(stored(), drifted))
                .toBeGreaterThanOrEqual(securityConfig.trustedDevice.fuzzyMatchThreshold);
        });

        it('treats a new browser on the same machine as a new device', () => {
            const score = scoreMatch(stored(), print(FIREFOX_WIN, LAPTOP));
            expect(score).toBeLessThan(securityConfig.trustedDevice.fuzzyMatchThreshold);
        });

        it('treats the same browser on a different machine as a new device', () => {
            const otherMachine = print(CHROME_WIN, {
                ...LAPTOP,
                platform: 'MacIntel',
                hardwareConcurrency: 12,
                deviceMemory: 16,
            });
            expect(scoreMatch(stored(), otherMachine))
                .toBeLessThan(securityConfig.trustedDevice.fuzzyMatchThreshold);
        });

        it('scores a completely unrelated device at zero', () => {
            expect(scoreMatch(stored(), print(SAFARI_IPHONE, {
                platform: 'iPhone',
                screenResolution: '390x844',
                timezone: 'Asia/Kolkata',
                language: 'en-IN',
                hardwareConcurrency: 6,
                deviceMemory: 4,
                touchSupport: true,
            }))).toBe(0);
        });
    });
});

describe('riskEvaluationService', () => {
    const at = (proximity, km = null) => ({ proximity, distanceKm: km });

    const trustedHere = {
        device: { known: true, trusted: true, matchType: 'exact' },
        deviceProximity: at(PROXIMITY.SAME, 5),
        knownProximity: at(PROXIMITY.SAME, 5),
    };

    it('lets a trusted device at a familiar place straight through', () => {
        const result = evaluateLogin(trustedHere);
        expect(result.require2FA).toBe(false);
        expect(result.score).toBe(0);
        expect(result.reasons).toContain(RISK_SIGNALS.TRUSTED_DEVICE);
    });

    it('challenges a trusted device that has moved country', () => {
        const result = evaluateLogin({
            ...trustedHere,
            deviceProximity: at(PROXIMITY.DIFFERENT_COUNTRY, 6700),
            knownProximity: at(PROXIMITY.DIFFERENT_COUNTRY, 6700),
        });
        expect(result.require2FA).toBe(true);
        expect(result.mandatory).toContain(RISK_SIGNALS.DIFFERENT_COUNTRY);
    });

    it('challenges an unrecognised device even at the user\'s own desk', () => {
        // The arithmetic alone would let this through at 20 points — which is
        // exactly why the hard rules exist alongside the score.
        const result = evaluateLogin({
            device: { known: false },
            knownProximity: at(PROXIMITY.SAME, 2),
        });
        expect(result.score).toBeLessThan(result.threshold);
        expect(result.require2FA).toBe(true);
        expect(result.mandatory).toContain(RISK_SIGNALS.NEW_DEVICE);
    });

    it('challenges a device that was seen before but never trusted', () => {
        const result = evaluateLogin({
            device: { known: true, trusted: false, matchType: 'exact' },
            deviceProximity: at(PROXIMITY.SAME, 1),
            knownProximity: at(PROXIMITY.SAME, 1),
        });
        expect(result.require2FA).toBe(true);
        expect(result.mandatory).toContain(RISK_SIGNALS.UNTRUSTED_DEVICE);
    });

    it('challenges a device whose trust has lapsed', () => {
        const result = evaluateLogin({
            device: { known: true, trusted: false, trustExpired: true, matchType: 'exact' },
            deviceProximity: at(PROXIMITY.SAME, 1),
            knownProximity: at(PROXIMITY.SAME, 1),
        });
        expect(result.require2FA).toBe(true);
        expect(result.mandatory).toContain(RISK_SIGNALS.EXPIRED_TRUST);
    });

    it('does not challenge a trusted device for a short trip', () => {
        const result = evaluateLogin({
            ...trustedHere,
            deviceProximity: at(PROXIMITY.NEARBY, 150),
        });
        expect(result.require2FA).toBe(false);
    });

    it('absorbs a small fingerprint drift without challenging', () => {
        const result = evaluateLogin({ ...trustedHere, device: { ...trustedHere.device, matchType: 'fuzzy' } });
        expect(result.require2FA).toBe(false);
        expect(result.reasons).toContain(RISK_SIGNALS.FINGERPRINT_DRIFT);
    });

    it('challenges on impossible travel', () => {
        const result = evaluateLogin({
            ...trustedHere,
            impossibleTravel: { detected: true, distanceKm: 6700, hours: 1, speedKmph: 6700 },
        });
        expect(result.require2FA).toBe(true);
        expect(result.mandatory).toContain(RISK_SIGNALS.IMPOSSIBLE_TRAVEL);
    });

    it('scores a VPN without challenging on it by default', () => {
        const result = evaluateLogin({ ...trustedHere, suspectedProxy: true });
        expect(result.reasons).toContain(RISK_SIGNALS.SUSPECTED_PROXY);
        expect(result.require2FA).toBe(false);
    });

    it('always challenges when the account asked to be asked every time', () => {
        const result = evaluateLogin({ ...trustedHere, userPreference2FA: true });
        expect(result.require2FA).toBe(true);
        expect(result.mandatory).toContain(RISK_SIGNALS.USER_PREFERENCE);
        // The preference is an override, not evidence of risk.
        expect(result.score).toBe(0);
    });

    it('clamps the score to 0-100', () => {
        const result = evaluateLogin({
            device: { known: false },
            knownProximity: at(PROXIMITY.DIFFERENT_COUNTRY, 6700),
            impossibleTravel: { detected: true, distanceKm: 6700, hours: 1, speedKmph: 6700 },
            suspectedProxy: true,
        });
        expect(result.score).toBe(100);
        expect(result.rawScore).toBeGreaterThan(100);
    });

    it('accepts a caller-supplied signal, which is how future ones arrive', () => {
        // A behavioural or model-derived signal needs no change to the engine:
        // it is scored alongside the built-in ones, and may declare itself
        // mandatory if it should never be outvoted.
        const scored = evaluateLogin({
            ...trustedHere,
            extraSignals: [{ code: 'behavioural_anomaly', weight: 80, detail: 'typing cadence' }],
        });
        expect(scored.reasons).toContain('behavioural_anomaly');
        // -30 trusted device, -20 known location, +80 anomaly.
        expect(scored.score).toBe(30);

        const mandatory = evaluateLogin({
            ...trustedHere,
            extraSignals: [{ code: 'device_reputation', weight: 10, mandatory: true }],
        });
        expect(mandatory.require2FA).toBe(true);
        expect(mandatory.mandatory).toContain('device_reputation');
    });

    describe('reconfiguration', () => {
        let weights;
        let triggers;
        let threshold;

        beforeEach(() => {
            weights = { ...securityConfig.risk.weights };
            triggers = { ...securityConfig.risk.hardTriggers };
            threshold = securityConfig.risk.threshold;
        });

        afterEach(() => {
            securityConfig.risk.weights = weights;
            securityConfig.risk.hardTriggers = triggers;
            securityConfig.risk.threshold = threshold;
        });

        it('lets a deployment hand the decision entirely to the score', () => {
            securityConfig.risk.hardTriggers.newDevice = false;
            const result = evaluateLogin({
                device: { known: false },
                knownProximity: at(PROXIMITY.SAME, 2),
            });
            expect(result.require2FA).toBe(false);
        });

        it('honours a lowered threshold', () => {
            securityConfig.risk.hardTriggers.suspectedProxy = false;
            securityConfig.risk.threshold = 10;
            const result = evaluateLogin({
                device: { known: true, trusted: false, matchType: 'exact' },
                deviceProximity: at(PROXIMITY.SAME, 1),
                knownProximity: at(PROXIMITY.UNKNOWN),
            });
            expect(result.thresholdExceeded).toBe(true);
        });

        it('honours a reweighted signal', () => {
            securityConfig.risk.weights.trustedDevice = 0;
            expect(evaluateLogin(trustedHere).score).toBe(0);
            securityConfig.risk.weights.differentCity = 90;
            const result = evaluateLogin({
                ...trustedHere,
                deviceProximity: at(PROXIMITY.DIFFERENT_CITY, 400),
            });
            expect(result.score).toBeGreaterThanOrEqual(70);
        });
    });
});
