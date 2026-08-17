import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import User from '../models/User.js';
import TrustedDevice from '../models/TrustedDevice.js';
import LoginHistory from '../models/LoginHistory.js';
import securityConfig from '../config/security.js';
import { RISK_SIGNALS } from '../services/riskEvaluationService.js';

/**
 * End-to-end coverage of location-aware login security.
 *
 * Every scenario is expressed the way a user would experience it — "my laptop,
 * from home" or "a new phone, from another country" — because that is the level
 * at which this feature either works or annoys people. The unit suite in
 * riskEngine.test.js proves the policy; this proves the plumbing.
 */

// Never send real mail from a test run. The mock doubles as the only way to
// learn the OTP: it is bcrypt-hashed the moment it is created, so reading it
// out of the delivery call is exactly what a user's inbox does.
vi.mock('../utils/sendOtp.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

vi.mock('../utils/fastapiClient.js', () => ({
    categorizeTransaction: vi.fn().mockResolvedValue({ category: 'Others', icon: 'CircleDollarSign', confidence_score: 0 }),
    checkFraud: vi.fn().mockResolvedValue({ risk_score: 0, risk_level: 'low', reason: 'test' }),
    getInsights: vi.fn().mockResolvedValue([]),
    getAssistantResponse: vi.fn().mockResolvedValue('ok'),
    default: {},
}));

vi.mock('../utils/socket.js', () => ({
    emitToUser: vi.fn(),
    getIO: vi.fn(),
    initSocket: vi.fn(),
    default: {},
}));

/**
 * Geolocation is stubbed at the boundary — the one place the system learns
 * where an IP is. Everything above it (distance, tiers, travel speed) is the
 * real implementation.
 */
const GEO = {
    '1.1.1.1': { city: 'New Delhi', region: 'Delhi', country: 'India', countryCode: 'IN', latitude: 28.6139, longitude: 77.209, isp: 'Airtel Broadband' },
    // A different address in the same city: a DHCP lease change, or a phone
    // moving from wifi to cellular.
    '1.1.1.2': { city: 'New Delhi', region: 'Delhi', country: 'India', countryCode: 'IN', latitude: 28.62, longitude: 77.21, isp: 'Jio Fiber' },
    '2.2.2.2': { city: 'Noida', region: 'Uttar Pradesh', country: 'India', countryCode: 'IN', latitude: 28.5355, longitude: 77.391, isp: 'Airtel Broadband' },
    '3.3.3.3': { city: 'Mumbai', region: 'Maharashtra', country: 'India', countryCode: 'IN', latitude: 19.076, longitude: 72.8777, isp: 'Jio Fiber' },
    '4.4.4.4': { city: 'London', region: 'England', country: 'United Kingdom', countryCode: 'GB', latitude: 51.5074, longitude: -0.1278, isp: 'BT Broadband' },
    '5.5.5.5': { city: 'Bengaluru', region: 'Karnataka', country: 'India', countryCode: 'IN', latitude: 12.9716, longitude: 77.5946, isp: 'ACT Fibernet' },
    '9.9.9.9': { city: 'Amsterdam', region: 'North Holland', country: 'Netherlands', countryCode: 'NL', latitude: 52.3676, longitude: 4.9041, isp: 'NordVPN' },
};

vi.mock('../utils/getLocation.js', () => ({
    default: vi.fn(async (ip) => ({
        ip,
        city: 'Unknown', region: null, country: null, countryCode: null,
        latitude: null, longitude: null, isp: 'Unknown ISP', resolved: false,
        ...(GEO[ip] ?? {}),
    })),
}));

const { buildTestApp } = await import('./helpers/app.js');
const sendOtp = (await import('../utils/sendOtp.js')).default;

let app;
beforeAll(() => { app = buildTestApp(); });

// --------------------------------------------------------------------- devices

const DEVICES = {
    laptop: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        info: {
            platform: 'Win32', screenResolution: '1920x1080', colorDepth: 24,
            timezone: 'Asia/Kolkata', language: 'en-US',
            hardwareConcurrency: 8, deviceMemory: 8, touchSupport: false,
        },
    },
    desktop: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        info: {
            platform: 'Win32', screenResolution: '2560x1440', colorDepth: 32,
            timezone: 'Asia/Kolkata', language: 'en-US',
            hardwareConcurrency: 16, deviceMemory: 32, touchSupport: false,
        },
    },
    phone: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
        info: {
            platform: 'iPhone', screenResolution: '390x844', colorDepth: 32,
            timezone: 'Asia/Kolkata', language: 'en-IN',
            hardwareConcurrency: 6, deviceMemory: 4, touchSupport: true,
        },
    },
    tablet: {
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/604.1',
        info: {
            platform: 'iPad', screenResolution: '1024x1366', colorDepth: 32,
            timezone: 'Asia/Kolkata', language: 'en-IN',
            hardwareConcurrency: 8, deviceMemory: 6, touchSupport: true,
        },
    },
};

/** The same laptop after an OS update and a new external monitor. */
const driftedLaptop = {
    userAgent: DEVICES.laptop.userAgent.replace('Chrome/120.0.0.0', 'Chrome/131.0.0.0'),
    info: { ...DEVICES.laptop.info, screenResolution: '2560x1440', timezone: 'Europe/London' },
};

const CREDENTIALS = {
    firstName: 'Asha',
    lastName: 'Rao',
    email: 'asha@example.com',
    password: 'Str0ngPass99',
};

// ----------------------------------------------------------------------- helpers

const send = (path, body, { device = DEVICES.laptop, ip = '1.1.1.1' } = {}) =>
    request(app)
        .post(path)
        .set('User-Agent', device.userAgent)
        // Trusted-proxy hop: with `trust proxy: 1` this becomes req.ip, which is
        // the only address the server will geolocate.
        .set('X-Forwarded-For', ip)
        .send({ ...body, deviceInfo: device.info });

const signup = (options) => send('/api/auth/signup', CREDENTIALS, options);

const login = (options) =>
    send('/api/auth/login', { email: CREDENTIALS.email, password: CREDENTIALS.password }, options);

/** The code as the user would read it out of their inbox. */
const lastEmailedCode = () => sendOtp.mock.calls.at(-1)?.[1];

const verify = (challenge, { trustDevice = false, ...options } = {}) =>
    send('/api/auth/verify-login-otp', {
        email: CREDENTIALS.email,
        otp: lastEmailedCode(),
        challengeId: challenge.body.challengeId,
        trustDevice,
    }, options);

/** Sign in and clear the challenge, trusting the device — the common setup. */
const establishTrust = async (options) => {
    const challenge = await login(options);
    if (challenge.status !== 403) return challenge;
    return verify(challenge, { ...options, trustDevice: true });
};

const historyFor = async (email) => {
    const user = await User.findOne({ email });
    return LoginHistory.find({ userId: user._id }).sort({ loginTime: -1 }).lean();
};

/** Backdate a device so it looks like it has not been used for `days`. */
const ageDevice = async (filter, days) => {
    const when = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    await TrustedDevice.updateMany(filter, { $set: { lastSeenAt: when } });
    await LoginHistory.updateMany({}, { $set: { loginTime: when } });
};

beforeEach(() => { sendOtp.mockClear(); });

// ------------------------------------------------------------------------ tests

describe('registration', () => {
    it('trusts the device the account was created on', async () => {
        const res = await signup();
        expect(res.status).toBe(201);

        const device = await TrustedDevice.findOne({});
        expect(device.trusted).toBe(true);
        expect(device.loginCount).toBe(1);
        expect(device.lastKnownCity).toBe('New Delhi');
        expect(device.deviceName).toBe('Chrome on Windows');
    });

    it('stores the fingerprint only as a keyed hash', async () => {
        await signup();
        const device = await TrustedDevice.findOne({});

        // A dump of this collection must not reveal what hardware anyone owns.
        expect(device.deviceFingerprint).toMatch(/^[0-9a-f]{64}$/);
        const serialised = JSON.stringify(device.toObject());
        expect(serialised).not.toContain('Win32');
        expect(serialised).not.toContain('1920x1080');
    });

    it('never records a precise coordinate the client supplied', async () => {
        await request(app)
            .post('/api/auth/signup')
            .set('User-Agent', DEVICES.laptop.userAgent)
            .set('X-Forwarded-For', '1.1.1.1')
            .send({
                ...CREDENTIALS,
                deviceInfo: DEVICES.laptop.info,
                // A malicious client claiming to be somewhere it is not.
                latitude: 51.5074,
                longitude: -0.1278,
                city: 'London',
            });

        const device = await TrustedDevice.findOne({});
        // Server-side IP geolocation wins, every time.
        expect(device.lastKnownCity).toBe('New Delhi');
        expect(device.lastKnownLatitude).toBeCloseTo(28.6139, 3);
    });
});

describe('same trusted device', () => {
    beforeEach(async () => { await signup(); });

    it('signs in from the same place without a code', async () => {
        const res = await login();

        expect(res.status).toBe(200);
        expect(res.body.accessToken).toBeTruthy();
        expect(sendOtp).not.toHaveBeenCalled();
    });

    it('does not care that the IP address changed', async () => {
        // Dynamic addressing, or a phone hopping from wifi to cellular. The
        // check is geographic, not an IP equality test — which is why this is
        // silent rather than a challenge.
        const res = await login({ ip: '1.1.1.2' });
        expect(res.status).toBe(200);
    });

    it('does not challenge for a trip inside the radius', async () => {
        // Noida is a different city in a different state, 25 km away.
        const res = await login({ ip: '2.2.2.2' });
        expect(res.status).toBe(200);
    });

    it('survives a browser update, an OS update and a new monitor', async () => {
        const res = await login({ device: driftedLaptop });

        expect(res.status).toBe(200);
        // Recognised through the fuzzy path, and re-anchored on the new
        // attributes so the next sign-in matches exactly.
        expect(await TrustedDevice.countDocuments({})).toBe(1);
    });

    it('challenges once after moving to another state, then stops', async () => {
        const challenge = await login({ ip: '3.3.3.3' });

        expect(challenge.status).toBe(403);
        expect(challenge.body.require2FA).toBe(true);
        expect(challenge.body.reason).toBe(RISK_SIGNALS.DIFFERENT_STATE);

        const verified = await verify(challenge, { ip: '3.3.3.3' });
        expect(verified.status).toBe(200);

        // The device now lives in Mumbai, so the next sign-in from there is
        // unremarkable.
        sendOtp.mockClear();
        const again = await login({ ip: '3.3.3.3' });
        expect(again.status).toBe(200);
        expect(sendOtp).not.toHaveBeenCalled();
    });

    it('challenges when it turns up in another country', async () => {
        const res = await login({ ip: '4.4.4.4' });

        expect(res.status).toBe(403);
        expect(res.body.reason).toBe(RISK_SIGNALS.DIFFERENT_COUNTRY);
    });

    it('leaves the device where it was when a challenge goes unanswered', async () => {
        await login({ ip: '4.4.4.4' });

        const device = await TrustedDevice.findOne({});
        // The critical property: an attacker who never completes the challenge
        // cannot move a trusted device's location to their own.
        expect(device.lastKnownCity).toBe('New Delhi');
        expect(device.loginCount).toBe(1);
        expect(device.trusted).toBe(true);
    });
});

describe('new device', () => {
    beforeEach(async () => { await signup(); });

    it('is challenged even from the usual place', async () => {
        const res = await login({ device: DEVICES.phone });

        expect(res.status).toBe(403);
        expect(res.body.reason).toBe(RISK_SIGNALS.NEW_DEVICE);
    });

    it('is challenged from a new place, and says so', async () => {
        const res = await login({ device: DEVICES.phone, ip: '4.4.4.4' });

        expect(res.status).toBe(403);
        expect(res.body.reason).toBe(RISK_SIGNALS.NEW_DEVICE);
        const [entry] = await historyFor(CREDENTIALS.email);
        expect(entry.riskReasons).toContain(RISK_SIGNALS.DIFFERENT_COUNTRY);
        expect(entry.riskScore).toBeGreaterThanOrEqual(50);
    });

    it('is challenged again next time when the user does not trust it', async () => {
        const challenge = await login({ device: DEVICES.phone });
        const verified = await verify(challenge, { device: DEVICES.phone, trustDevice: false });
        expect(verified.status).toBe(200);
        expect(verified.body.deviceTrusted).toBe(false);

        // The shared-computer case: verifying proves who you are once, and
        // grants nothing beyond that session.
        const next = await login({ device: DEVICES.phone });
        expect(next.status).toBe(403);
        expect(next.body.reason).toBe(RISK_SIGNALS.UNTRUSTED_DEVICE);
    });

    it('stops asking once the user trusts it', async () => {
        const challenge = await login({ device: DEVICES.phone });
        const verified = await verify(challenge, { device: DEVICES.phone, trustDevice: true });

        expect(verified.status).toBe(200);
        expect(verified.body.deviceTrusted).toBe(true);

        sendOtp.mockClear();
        const next = await login({ device: DEVICES.phone });
        expect(next.status).toBe(200);
        expect(sendOtp).not.toHaveBeenCalled();
    });

    it('treats a second browser on the same machine as a new device', async () => {
        const firefox = {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
            info: DEVICES.laptop.info,
        };

        const res = await login({ device: firefox });
        expect(res.status).toBe(403);
        expect(res.body.reason).toBe(RISK_SIGNALS.NEW_DEVICE);
    });
});

describe('multiple trusted devices', () => {
    beforeEach(async () => { await signup(); });

    it('keeps a trust decision, a location and a counter per device', async () => {
        await establishTrust({ device: DEVICES.phone, ip: '3.3.3.3' });   // Mumbai
        await establishTrust({ device: DEVICES.tablet, ip: '5.5.5.5' });  // Bengaluru

        const devices = await TrustedDevice.find({}).sort({ createdAt: 1 }).lean();
        expect(devices).toHaveLength(3);
        expect(devices.map((d) => d.lastKnownCity)).toEqual(['New Delhi', 'Mumbai', 'Bengaluru']);
        expect(devices.every((d) => d.trusted)).toBe(true);
    });

    it('lets each device sign in from its own city without a code', async () => {
        await establishTrust({ device: DEVICES.phone, ip: '3.3.3.3' });
        await establishTrust({ device: DEVICES.tablet, ip: '5.5.5.5' });

        sendOtp.mockClear();
        expect((await login({ device: DEVICES.laptop, ip: '1.1.1.1' })).status).toBe(200);
        expect((await login({ device: DEVICES.phone, ip: '3.3.3.3' })).status).toBe(200);
        expect((await login({ device: DEVICES.tablet, ip: '5.5.5.5' })).status).toBe(200);
        expect(sendOtp).not.toHaveBeenCalled();
    });

    it('does not invalidate the others when one moves and re-verifies', async () => {
        await establishTrust({ device: DEVICES.phone, ip: '3.3.3.3' });

        // The laptop travels to Bengaluru and is challenged once.
        const challenge = await login({ device: DEVICES.laptop, ip: '5.5.5.5' });
        expect(challenge.status).toBe(403);
        await verify(challenge, { device: DEVICES.laptop, ip: '5.5.5.5' });

        // The phone, untouched, still signs in silently from Mumbai.
        sendOtp.mockClear();
        expect((await login({ device: DEVICES.phone, ip: '3.3.3.3' })).status).toBe(200);
        expect(sendOtp).not.toHaveBeenCalled();
    });

    it('does not read two devices in two cities as impossible travel', async () => {
        await establishTrust({ device: DEVICES.phone, ip: '3.3.3.3' });

        // Delhi and Mumbai, seconds apart, on two devices the user owns. Judged
        // per device, this is simply two people-shaped facts about one account.
        const res = await login({ device: DEVICES.laptop, ip: '1.1.1.1' });
        expect(res.status).toBe(200);
    });
});

describe('impossible travel', () => {
    it('challenges a trusted device that crosses the planet in an hour', async () => {
        await signup();

        // The same laptop, in London, an instant after signing in from Delhi.
        const challenge = await login({ device: DEVICES.laptop, ip: '4.4.4.4' });
        expect(challenge.status).toBe(403);

        const [entry] = await historyFor(CREDENTIALS.email);
        expect(entry.riskReasons).toContain(RISK_SIGNALS.IMPOSSIBLE_TRAVEL);
        // -30 trusted device, +40 different country, +50 impossible travel.
        expect(entry.riskScore).toBe(60);
    });

    it('accepts the same journey once enough time has passed', async () => {
        await signup();
        // Backdate the last sighting by a day: a flight, not a teleport.
        await ageDevice({}, 1);

        const challenge = await login({ device: DEVICES.laptop, ip: '4.4.4.4' });
        // Still a country change, so still challenged — but not for travel.
        expect(challenge.status).toBe(403);
        const [entry] = await historyFor(CREDENTIALS.email);
        expect(entry.riskReasons).not.toContain(RISK_SIGNALS.IMPOSSIBLE_TRAVEL);
    });
});

describe('VPN and proxy connections', () => {
    beforeEach(async () => { await signup(); });

    it('records the signal without challenging on it by default', async () => {
        // A VPN exit in Amsterdam is a country change on its own, so this asserts
        // the signal is recorded rather than that it decided the outcome.
        const res = await login({ ip: '9.9.9.9' });
        expect(res.status).toBe(403);

        const [entry] = await historyFor(CREDENTIALS.email);
        expect(entry.suspectedProxy).toBe(true);
        expect(entry.riskReasons).toContain(RISK_SIGNALS.SUSPECTED_PROXY);
    });

    it('can be configured to challenge on the proxy alone', async () => {
        const original = securityConfig.risk.hardTriggers.suspectedProxy;
        securityConfig.risk.hardTriggers.suspectedProxy = true;

        try {
            // Same city, same trusted device — only the ISP looks like a VPN.
            const vpnAtHome = { ...GEO['1.1.1.1'], isp: 'Mullvad VPN' };
            GEO['1.1.1.3'] = vpnAtHome;

            const res = await login({ ip: '1.1.1.3' });
            expect(res.status).toBe(403);
            expect(res.body.reason).toBe(RISK_SIGNALS.SUSPECTED_PROXY);
        } finally {
            securityConfig.risk.hardTriggers.suspectedProxy = original;
            delete GEO['1.1.1.3'];
        }
    });
});

describe('trust expiry', () => {
    it('challenges a device that has not been used for the inactivity window', async () => {
        await signup();
        await ageDevice({}, securityConfig.trustedDevice.inactivityDays + 1);

        const res = await login();
        expect(res.status).toBe(403);
        expect(res.body.reason).toBe(RISK_SIGNALS.EXPIRED_TRUST);

        // The lapse is persisted, so the device list tells the user the truth.
        const device = await TrustedDevice.findOne({});
        expect(device.trusted).toBe(false);
    });

    it('re-trusts on request after the user verifies again', async () => {
        await signup();
        await ageDevice({}, securityConfig.trustedDevice.inactivityDays + 1);

        const challenge = await login();
        await verify(challenge, { trustDevice: true });

        const device = await TrustedDevice.findOne({});
        expect(device.trusted).toBe(true);

        sendOtp.mockClear();
        expect((await login()).status).toBe(200);
        expect(sendOtp).not.toHaveBeenCalled();
    });

    it('keeps the device untrusted when the user declines to re-trust it', async () => {
        await signup();
        await ageDevice({}, securityConfig.trustedDevice.inactivityDays + 1);

        const challenge = await login();
        await verify(challenge, { trustDevice: false });

        const device = await TrustedDevice.findOne({});
        expect(device.trusted).toBe(false);
        expect(device.trustState).toBe('expired');
    });
});

describe('challenge integrity', () => {
    beforeEach(async () => { await signup(); });

    it('rejects a code replayed from a different device', async () => {
        // Real-time phishing: the attacker has the code but not the browser it
        // was issued to.
        const challenge = await login({ device: DEVICES.phone });

        const stolen = await verify(challenge, { device: DEVICES.tablet });
        expect(stolen.status).toBe(401);
        expect(stolen.body.message).toMatch(/different device/i);

        // And the legitimate user's challenge survives the attempt.
        const genuine = await verify(challenge, { device: DEVICES.phone });
        expect(genuine.status).toBe(200);
    });

    it('rejects a code presented without its challenge id', async () => {
        const challenge = await login({ device: DEVICES.phone });

        const res = await send('/api/auth/verify-login-otp', {
            email: CREDENTIALS.email,
            otp: lastEmailedCode(),
        }, { device: DEVICES.phone });

        expect(res.status).toBe(400);
    });

    it('rejects a second use of the same code', async () => {
        const challenge = await login({ device: DEVICES.phone });
        const code = lastEmailedCode();

        expect((await verify(challenge, { device: DEVICES.phone })).status).toBe(200);

        const replay = await send('/api/auth/verify-login-otp', {
            email: CREDENTIALS.email,
            otp: code,
            challengeId: challenge.body.challengeId,
        }, { device: DEVICES.phone });

        expect(replay.status).toBe(400);
    });

    it('keeps the device binding across a resend', async () => {
        const challenge = await login({ device: DEVICES.phone });

        const resent = await send('/api/auth/resend-login-otp', { email: CREDENTIALS.email });
        expect(resent.status).toBe(200);

        // The new code still belongs to the original challenge and device: a
        // resend must not be a way to re-point a pending login somewhere else.
        const wrongDevice = await verify(challenge, { device: DEVICES.tablet });
        expect(wrongDevice.status).toBe(401);

        const rightDevice = await verify(challenge, { device: DEVICES.phone });
        expect(rightDevice.status).toBe(200);
    });

    it('answers a resend for an unknown address the same way', async () => {
        const res = await send('/api/auth/resend-login-otp', { email: 'nobody@example.com' });
        expect(res.status).toBe(200);
        expect(sendOtp).not.toHaveBeenCalled();
    });

    it('does not reveal whether an address exists when verifying', async () => {
        const known = await send('/api/auth/verify-login-otp', {
            email: CREDENTIALS.email, otp: '123456', challengeId: 'x',
        });
        const unknown = await send('/api/auth/verify-login-otp', {
            email: 'nobody@example.com', otp: '123456', challengeId: 'x',
        });

        expect(known.status).toBe(unknown.status);
        expect(known.body.message).toBe(unknown.body.message);
    });
});

describe('login history', () => {
    it('records the location, the device and the decision for every attempt', async () => {
        await signup();
        await login({ device: DEVICES.phone, ip: '3.3.3.3' });

        const entries = await historyFor(CREDENTIALS.email);
        expect(entries).toHaveLength(2);

        const [challenged] = entries;
        expect(challenged.city).toBe('Mumbai');
        expect(challenged.state).toBe('Maharashtra');
        expect(challenged.country).toBe('India');
        expect(challenged.browser).toBe('Safari');
        expect(challenged.os).toBe('iOS');
        expect(challenged.deviceType).toBe('mobile');
        expect(challenged.twoFactorRequired).toBe(true);
        expect(challenged.twoFactorPassed).toBe(false);
        expect(challenged.deviceId).toBeTruthy();
    });

    it('closes the loop when the challenge is answered', async () => {
        await signup();
        const challenge = await login({ device: DEVICES.phone });
        await verify(challenge, { device: DEVICES.phone });

        const [entry] = await historyFor(CREDENTIALS.email);
        expect(entry.twoFactorRequired).toBe(true);
        expect(entry.twoFactorPassed).toBe(true);
    });

    it('does not let an unanswered challenge establish a place as familiar', async () => {
        await signup();

        // An attacker in London fails the challenge repeatedly. If those
        // attempts counted as "known locations", they could bootstrap their own
        // city into the user's profile and stop being challenged.
        await login({ device: DEVICES.phone, ip: '4.4.4.4' });
        await login({ device: DEVICES.phone, ip: '4.4.4.4' });

        const res = await login({ device: DEVICES.tablet, ip: '4.4.4.4' });
        expect(res.status).toBe(403);

        const [entry] = await historyFor(CREDENTIALS.email);
        expect(entry.riskReasons).toContain(RISK_SIGNALS.DIFFERENT_COUNTRY);
    });
});

describe('device management', () => {
    const authed = async () => {
        const res = await signup();
        return res.body.accessToken;
    };

    it('lists devices without exposing their fingerprints', async () => {
        const token = await authed();
        await establishTrust({ device: DEVICES.phone, ip: '3.3.3.3' });

        const res = await request(app)
            .get('/api/security/devices')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.devices).toHaveLength(2);
        expect(res.body.devices[0]).toMatchObject({ trusted: true });
        expect(JSON.stringify(res.body)).not.toContain('Fingerprint');
    });

    it('revokes one device and challenges it next time', async () => {
        const token = await authed();
        await establishTrust({ device: DEVICES.phone, ip: '3.3.3.3' });

        const list = await request(app).get('/api/security/devices').set('Authorization', `Bearer ${token}`);
        const phone = list.body.devices.find((d) => d.deviceType === 'mobile');

        const removed = await request(app)
            .delete(`/api/security/devices/${phone.id}`)
            .set('Authorization', `Bearer ${token}`);
        expect(removed.status).toBe(200);

        const res = await login({ device: DEVICES.phone, ip: '3.3.3.3' });
        expect(res.status).toBe(403);
        expect(res.body.reason).toBe(RISK_SIGNALS.NEW_DEVICE);
    });

    it('leaves the other devices alone when one is revoked', async () => {
        const token = await authed();
        await establishTrust({ device: DEVICES.phone, ip: '3.3.3.3' });

        const list = await request(app).get('/api/security/devices').set('Authorization', `Bearer ${token}`);
        const phone = list.body.devices.find((d) => d.deviceType === 'mobile');
        await request(app).delete(`/api/security/devices/${phone.id}`).set('Authorization', `Bearer ${token}`);

        sendOtp.mockClear();
        expect((await login({ device: DEVICES.laptop })).status).toBe(200);
        expect(sendOtp).not.toHaveBeenCalled();
    });

    it('refuses to touch another account\'s devices', async () => {
        const token = await authed();

        const other = await request(app)
            .post('/api/auth/signup')
            .set('User-Agent', DEVICES.tablet.userAgent)
            .set('X-Forwarded-For', '5.5.5.5')
            .send({ ...CREDENTIALS, email: 'mallory@example.com', deviceInfo: DEVICES.tablet.info });

        const theirDevices = await request(app)
            .get('/api/security/devices')
            .set('Authorization', `Bearer ${other.body.accessToken}`);

        const res = await request(app)
            .delete(`/api/security/devices/${theirDevices.body.devices[0].id}`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(404);
        expect(await TrustedDevice.countDocuments({})).toBe(2);
    });

    it('revokes everything at once', async () => {
        const token = await authed();
        await establishTrust({ device: DEVICES.phone, ip: '3.3.3.3' });

        const res = await request(app).delete('/api/security/devices').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.removed).toBe(2);
        expect(await TrustedDevice.countDocuments({})).toBe(0);
    });

    it('renames a device', async () => {
        const token = await authed();
        const list = await request(app).get('/api/security/devices').set('Authorization', `Bearer ${token}`);

        const res = await request(app)
            .patch(`/api/security/devices/${list.body.devices[0].id}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Work laptop' });

        expect(res.status).toBe(200);
        expect((await TrustedDevice.findOne({})).deviceName).toBe('Work laptop');
    });

    it('serves the sign-in history', async () => {
        const token = await authed();
        await login({ device: DEVICES.phone, ip: '3.3.3.3' });

        const res = await request(app)
            .get('/api/security/sign-ins')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.entries[0]).toMatchObject({
            location: 'Mumbai, Maharashtra, India',
            twoFactorRequired: true,
        });
    });

    it('requires authentication', async () => {
        expect((await request(app).get('/api/security/devices')).status).toBe(401);
    });
});

describe('degraded geolocation', () => {
    it('signs a trusted device in when the location provider says nothing', async () => {
        await signup();

        // An unmapped address: the stub returns "Unknown", exactly as the real
        // provider does when it fails. An outage at a third party must not
        // challenge every user on the platform.
        const res = await login({ ip: '203.0.113.7' });
        expect(res.status).toBe(200);
    });

    it('still challenges an unknown device when location is unavailable', async () => {
        await signup();
        const res = await login({ device: DEVICES.phone, ip: '203.0.113.7' });
        expect(res.status).toBe(403);
    });
});
