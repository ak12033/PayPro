import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import User from '../models/User.js';
import Otp from '../models/Otp.js';
import Session from '../models/Session.js';
import RiskCase from '../models/RiskCase.js';
import Transaction from '../models/Transaction.js';
import AuditLog, { AUDIT } from '../models/AuditLog.js';
import { totp, TOTP_PERIOD_SECONDS } from '../utils/totp.js';

vi.mock('../utils/sendOtp.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../utils/fastapiClient.js', () => ({
    categorizeTransaction: vi.fn().mockResolvedValue({ category: 'Others', icon: 'CircleDollarSign', confidence_score: 0 }),
    checkFraud: vi.fn().mockResolvedValue({ risk_score: 0, risk_level: 'low', reason: 'test' }),
    default: {},
}));
vi.mock('../utils/socket.js', () => ({
    emitToUser: vi.fn(), getIO: vi.fn(), initSocket: vi.fn(), default: {},
}));
vi.mock('../utils/fcm.js', () => ({
    sendPushNotification: vi.fn().mockResolvedValue({ success: true, failedTokens: [] }),
    default: {},
}));

/**
 * Phase 4 close-out (2026-09-22): authenticator app (§31.2.4), mandatory staff
 * 2FA (§28.3 rule 5), admin "Reset 2FA", risk-case escalation and the
 * audit-log date filter (§28.2).
 */
const { buildTestApp } = await import('./helpers/app.js');
const sendOtp = (await import('../utils/sendOtp.js')).default;

let app;
beforeAll(() => { app = buildTestApp(); });

const PASSWORD = 'Str0ngPass99';
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const settle = () => new Promise((r) => setTimeout(r, 60));

const signup = async (email) => {
    const res = await request(app).post('/api/auth/signup').send({ firstName: 'Test', email, password: PASSWORD });
    return { token: res.body.accessToken, id: res.body.user._id, email };
};

/** The code an authenticator app would show `offset` steps from now. */
const codeFor = (secret, offset = 0) => totp(secret, { timeMs: Date.now() + offset * TOTP_PERIOD_SECONDS * 1000 });

/**
 * A code is single-use per 30-second step (the replay guard). Tests that use
 * the same factor several times inside one step clear the guard between uses,
 * which is what waiting for the next step would do.
 */
const nextStep = (userId) => User.updateOne({ _id: userId }, { $set: { 'totp.lastUsedStep': -1 } });

const enrol = async (account) => {
    const setup = await request(app).post('/api/auth/totp/setup').set(auth(account.token));
    expect(setup.status).toBe(200);
    const enable = await request(app).post('/api/auth/totp/enable').set(auth(account.token))
        .send({ code: codeFor(setup.body.secret) });
    expect(enable.status).toBe(200);
    await nextStep(account.id);
    return { secret: setup.body.secret, recoveryCodes: enable.body.recoveryCodes };
};

const login = (email, body = {}) => request(app).post('/api/auth/login').send({ email, password: PASSWORD, ...body });

describe('authenticator enrolment', () => {
    it('stores the secret encrypted, returns ten recovery codes once, and stores only their hashes', async () => {
        const asha = await signup('asha@example.com');
        const { secret, recoveryCodes } = await enrol(asha);

        expect(recoveryCodes).toHaveLength(10);
        expect(new Set(recoveryCodes).size).toBe(10);
        recoveryCodes.forEach((c) => expect(c).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/));

        const stored = await User.findById(asha.id).select('+totp.secret +totp.recoveryCodes').lean();
        expect(stored.totp.enabled).toBe(true);
        expect(stored.totp.secret).toMatch(/^v1:/);
        expect(stored.totp.secret).not.toContain(secret);
        const serialised = JSON.stringify(stored.totp.recoveryCodes);
        recoveryCodes.forEach((c) => expect(serialised).not.toContain(c.replace('-', '')));

        // The default projection never carries the secret.
        const plain = await User.findById(asha.id).lean();
        expect(plain.totp.secret).toBeUndefined();

        const status = await request(app).get('/api/auth/totp').set(auth(asha.token));
        expect(status.body).toMatchObject({ enabled: true, recoveryCodesRemaining: 10, required: false });

        await settle();
        expect(await AuditLog.exists({ action: AUDIT.TOTP_ENABLED, userId: asha.id, outcome: 'success' })).toBeTruthy();
    });

    it('does not turn on until a code from the app verifies', async () => {
        const asha = await signup('asha@example.com');
        await request(app).post('/api/auth/totp/setup').set(auth(asha.token));
        const bad = await request(app).post('/api/auth/totp/enable').set(auth(asha.token)).send({ code: '000000' });
        expect(bad.status).toBe(401);
        expect((await User.findById(asha.id).lean()).totp.enabled).toBe(false);
    });

    it('refuses a second setup while one is active', async () => {
        const asha = await signup('asha@example.com');
        await enrol(asha);
        const again = await request(app).post('/api/auth/totp/setup').set(auth(asha.token));
        expect(again.status).toBe(409);
    });

    it('turns off only with the password and a current code', async () => {
        const asha = await signup('asha@example.com');
        const { secret } = await enrol(asha);

        const noCode = await request(app).post('/api/auth/totp/disable').set(auth(asha.token)).send({ currentPassword: PASSWORD });
        expect(noCode.status).toBe(400);
        const wrongPassword = await request(app).post('/api/auth/totp/disable').set(auth(asha.token))
            .send({ currentPassword: 'nope-nope-1', code: codeFor(secret) });
        expect(wrongPassword.status).toBe(401);

        const ok = await request(app).post('/api/auth/totp/disable').set(auth(asha.token))
            .send({ currentPassword: PASSWORD, code: codeFor(secret) });
        expect(ok.status).toBe(200);
        const stored = await User.findById(asha.id).select('+totp.secret +totp.recoveryCodes').lean();
        expect(stored.totp).toMatchObject({ enabled: false, secret: null, recoveryCodes: [] });
    });

    it('re-issues recovery codes and the old ones stop working', async () => {
        const asha = await signup('asha@example.com');
        const { secret, recoveryCodes: old } = await enrol(asha);
        const res = await request(app).post('/api/auth/totp/recovery-codes').set(auth(asha.token))
            .send({ currentPassword: PASSWORD, code: codeFor(secret) });
        expect(res.status).toBe(200);
        expect(res.body.recoveryCodes).toHaveLength(10);

        await User.updateOne({ _id: asha.id }, { $set: { 'preferences.twoFactorAuth': true } });
        const challenge = await login(asha.email);
        const withOld = await request(app).post('/api/auth/verify-login-otp')
            .send({ email: asha.email, otp: old[0], challengeId: challenge.body.challengeId });
        expect(withOld.status).toBe(401);
    });
});

describe('sign-in with an authenticator', () => {
    it('asks for the app instead of emailing a code, and a resend emails nothing', async () => {
        const asha = await signup('asha@example.com');
        const { secret } = await enrol(asha);
        await User.updateOne({ _id: asha.id }, { $set: { 'preferences.twoFactorAuth': true } });
        sendOtp.mockClear();

        const challenge = await login(asha.email);
        expect(challenge.status).toBe(403);
        expect(challenge.body).toMatchObject({ require2FA: true, method: 'totp' });
        expect(challenge.body.message).toMatch(/authenticator/i);

        await request(app).post('/api/auth/resend-login-otp').send({ email: asha.email });
        expect(sendOtp).not.toHaveBeenCalled();
        const record = await Otp.findOne({ email: asha.email, purpose: 'login' }).lean();
        expect(record.otpHash).toBeUndefined();

        const ok = await request(app).post('/api/auth/verify-login-otp')
            .send({ email: asha.email, otp: codeFor(secret), challengeId: challenge.body.challengeId });
        expect(ok.status).toBe(200);
        expect(ok.body.accessToken).toBeTruthy();
        expect(ok.body.user.totpEnabled).toBe(true);
    });

    it('refuses the same code twice (replay)', async () => {
        const asha = await signup('asha@example.com');
        const { secret } = await enrol(asha);
        await User.updateOne({ _id: asha.id }, { $set: { 'preferences.twoFactorAuth': true } });
        const code = codeFor(secret);

        const first = await login(asha.email);
        expect((await request(app).post('/api/auth/verify-login-otp')
            .send({ email: asha.email, otp: code, challengeId: first.body.challengeId })).status).toBe(200);

        const second = await login(asha.email);
        const replay = await request(app).post('/api/auth/verify-login-otp')
            .send({ email: asha.email, otp: code, challengeId: second.body.challengeId });
        expect(replay.status).toBe(401);
    });

    it('accepts each recovery code once, warns the holder, and never proves the email address', async () => {
        const asha = await signup('asha@example.com');
        const { recoveryCodes } = await enrol(asha);
        await User.updateOne({ _id: asha.id }, { $set: { 'preferences.twoFactorAuth': true, emailVerified: false } });

        const challenge = await login(asha.email);
        const ok = await request(app).post('/api/auth/verify-login-otp')
            // Lowercase, no dash: typed from paper.
            .send({ email: asha.email, otp: recoveryCodes[0].toLowerCase().replace('-', ''), challengeId: challenge.body.challengeId });
        expect(ok.status).toBe(200);
        expect(ok.body.recoveryCodesRemaining).toBe(9);

        const again = await login(asha.email);
        const reused = await request(app).post('/api/auth/verify-login-otp')
            .send({ email: asha.email, otp: recoveryCodes[0], challengeId: again.body.challengeId });
        expect(reused.status).toBe(401);

        await settle();
        expect(await AuditLog.exists({ action: AUDIT.TOTP_RECOVERY_CODE_USED, userId: asha.id })).toBeTruthy();
        // An authenticator code says nothing about the inbox.
        expect((await User.findById(asha.id).lean()).emailVerified).toBe(false);
    });

    it('confirms a challenged transfer with the app, pinned to the same recipient and amount', async () => {
        const asha = await signup('asha@example.com');
        const bob = await signup('bob@example.com');
        const { secret } = await enrol(asha);
        await User.updateOne({ _id: asha.id }, { $set: { balanceMinor: 100000, accountBalance: 1000, emailVerified: true } });
        // Five transfers to Bob today: the sixth always asks (velocity policy).
        await Transaction.insertMany(Array.from({ length: 5 }, (_, i) => ({
            userId: asha.id, recipientId: bob.id, description: 'seed', amount: 1, type: 'Debit',
            category: 'Transfer', invoiceId: `TOTPSEED${i}${Date.now()}`,
        })));
        sendOtp.mockClear();

        const challenged = await request(app).post('/api/transactions/transfer').set(auth(asha.token))
            .send({ recipientId: bob.id, amount: 250 });
        expect(challenged.status).toBe(403);
        expect(challenged.body).toMatchObject({ require2FA: true, method: 'totp' });
        expect(sendOtp).not.toHaveBeenCalled();

        const wrong = await request(app).post('/api/transactions/verify-otp').set(auth(asha.token)).send({ otp: '000000' });
        expect(wrong.status).toBe(401);

        const ok = await request(app).post('/api/transactions/verify-otp').set(auth(asha.token)).send({ otp: codeFor(secret) });
        expect(ok.status).toBe(200);
        expect((await User.findById(bob.id).lean()).balanceMinor).toBe(25000);
    });
});

describe('mandatory staff 2FA (§28.3 rule 5)', () => {
    it('holds staff without an authenticator at enrolment, then lets them in once enrolled', async () => {
        const rita = await signup('rita@example.com');
        await User.updateOne({ _id: rita.id }, { $set: { role: 'risk' } });

        const refused = await request(app).get('/api/admin/metrics').set(auth(rita.token));
        expect(refused.status).toBe(403);
        expect(refused.body.code).toBe('TOTP_ENROLMENT_REQUIRED');

        // Their own wallet is unaffected.
        expect((await request(app).get('/api/auth/totp').set(auth(rita.token))).body.required).toBe(true);

        await enrol(rita);
        expect((await request(app).get('/api/admin/metrics').set(auth(rita.token))).status).toBe(200);
    });

    it('challenges every staff sign-in, even from a device that would not otherwise be asked', async () => {
        const rita = await signup('rita@example.com');
        const { secret } = await enrol(rita);
        await User.updateOne({ _id: rita.id }, { $set: { role: 'admin' } });

        const challenge = await login(rita.email);
        expect(challenge.status).toBe(403);
        expect(challenge.body).toMatchObject({ method: 'totp', reason: 'staff_account' });
        const ok = await request(app).post('/api/auth/verify-login-otp')
            .send({ email: rita.email, otp: codeFor(secret), challengeId: challenge.body.challengeId });
        expect(ok.status).toBe(200);
    });

    it('does not let staff remove their own authenticator', async () => {
        const rita = await signup('rita@example.com');
        const { secret } = await enrol(rita);
        await User.updateOne({ _id: rita.id }, { $set: { role: 'support' } });
        const res = await request(app).post('/api/auth/totp/disable').set(auth(rita.token))
            .send({ currentPassword: PASSWORD, code: codeFor(secret) });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('TOTP_REQUIRED_FOR_STAFF');
    });
});

describe('POST /api/admin/users/:userId/reset-2fa', () => {
    const admin = async () => {
        const a = await signup('admin@example.com');
        await User.updateOne({ _id: a.id }, { $set: { role: 'admin', 'totp.enabled': true } });
        return a;
    };

    it('is admin-only, re-authenticated, needs a reason, and never on your own account', async () => {
        const boss = await admin();
        const risk = await signup('risk@example.com');
        await User.updateOne({ _id: risk.id }, { $set: { role: 'risk', 'totp.enabled': true } });
        const asha = await signup('asha@example.com');
        await enrol(asha);
        const url = `/api/admin/users/${asha.id}/reset-2fa`;
        const body = { currentPassword: PASSWORD, reason: 'Verified by video call and ID' };

        expect((await request(app).post(url).set(auth(risk.token)).send(body)).status).toBe(403);
        expect((await request(app).post(url).set(auth(boss.token)).send({ ...body, reason: 'short' })).status).toBe(400);
        expect((await request(app).post(url).set(auth(boss.token)).send({ ...body, currentPassword: 'wrong-pass-1' })).status).toBe(401);
        const self = await request(app).post(`/api/admin/users/${boss.id}/reset-2fa`).set(auth(boss.token)).send(body);
        expect(self.status).toBe(403);
        expect(self.body.code).toBe('SELF_RESET');
    });

    it('removes the authenticator, signs the holder out everywhere, audits and tells them', async () => {
        const boss = await admin();
        const asha = await signup('asha@example.com');
        await enrol(asha);
        expect(await Session.countDocuments({ userId: asha.id })).toBeGreaterThan(0);

        const res = await request(app).post(`/api/admin/users/${asha.id}/reset-2fa`).set(auth(boss.token))
            .send({ currentPassword: PASSWORD, reason: 'Lost phone; verified by video call' });
        expect(res.status).toBe(200);

        const stored = await User.findById(asha.id).select('+totp.secret').lean();
        expect(stored.totp).toMatchObject({ enabled: false, secret: null });
        expect(await Session.countDocuments({ userId: asha.id })).toBe(0);
        // Their live access token dies on its next request.
        expect((await request(app).get('/api/auth/totp').set(auth(asha.token))).status).toBe(401);

        await settle();
        const entry = await AuditLog.findOne({ action: AUDIT.ADMIN_2FA_RESET }).lean();
        expect(entry.target.id).toBe(asha.id);
        expect(entry.metadata.reason).toMatch(/video call/);

        // Falls back to emailed codes.
        await User.updateOne({ _id: asha.id }, { $set: { 'preferences.twoFactorAuth': true } });
        expect((await login(asha.email)).body.method).toBe('email');
    });

    it('refuses an account with nothing to reset', async () => {
        const boss = await admin();
        const asha = await signup('asha@example.com');
        const res = await request(app).post(`/api/admin/users/${asha.id}/reset-2fa`).set(auth(boss.token))
            .send({ currentPassword: PASSWORD, reason: 'Verified by video call and ID' });
        expect(res.status).toBe(409);
    });
});

describe('risk case escalation (§28.2)', () => {
    const openCase = (userId, overrides = {}) => RiskCase.create({
        userId, score: 75, action: 'hold', priority: 'normal',
        intent: { kind: 'transfer', amount: 600 },
        autoReleaseAt: new Date(Date.now() + 60 * 60 * 1000),
        ...overrides,
    });

    const staffPair = async () => {
        const risk = await signup('risk@example.com');
        const boss = await signup('admin@example.com');
        await User.updateOne({ _id: risk.id }, { $set: { role: 'risk', 'totp.enabled': true } });
        await User.updateOne({ _id: boss.id }, { $set: { role: 'admin', 'totp.enabled': true } });
        return { risk, boss };
    };

    it('makes the case urgent, admin-only, extends the hold once, and notifies admins', async () => {
        const { risk, boss } = await staffPair();
        const asha = await signup('asha@example.com');
        const riskCase = await openCase(asha.id);

        const short = await request(app).post(`/api/admin/risk/cases/${riskCase._id}/escalate`).set(auth(risk.token)).send({ reason: 'hmm' });
        expect(short.status).toBe(400);

        const res = await request(app).post(`/api/admin/risk/cases/${riskCase._id}/escalate`).set(auth(risk.token))
            .send({ reason: 'Recipient matches a fraud report' });
        expect(res.status).toBe(200);
        expect(res.body.case.priority).toBe('urgent');
        expect(res.body.case.status).toBe('open');
        expect(new Date(res.body.case.autoReleaseAt).getTime()).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);

        const twice = await request(app).post(`/api/admin/risk/cases/${riskCase._id}/escalate`).set(auth(risk.token))
            .send({ reason: 'Recipient matches a fraud report' });
        expect(twice.status).toBe(409);

        const byRisk = await request(app).post(`/api/admin/risk/cases/${riskCase._id}/decision`).set(auth(risk.token))
            .send({ decision: 'approved' });
        expect(byRisk.status).toBe(403);
        expect(byRisk.body.code).toBe('ESCALATED');

        const byAdmin = await request(app).post(`/api/admin/risk/cases/${riskCase._id}/decision`).set(auth(boss.token))
            .send({ decision: 'rejected' });
        expect(byAdmin.status).toBe(200);

        await settle();
        expect(await AuditLog.exists({ action: AUDIT.RISK_CASE_ESCALATED })).toBeTruthy();
    });

    it('does not shorten a deadline that is already later, and leaves blocks without one', async () => {
        const { risk } = await staffPair();
        const asha = await signup('asha@example.com');
        const far = new Date(Date.now() + 72 * 60 * 60 * 1000);
        const hold = await openCase(asha.id, { autoReleaseAt: far });
        const block = await openCase(asha.id, { action: 'block', autoReleaseAt: null });

        const a = await request(app).post(`/api/admin/risk/cases/${hold._id}/escalate`).set(auth(risk.token)).send({ reason: 'Needs a second opinion' });
        expect(new Date(a.body.case.autoReleaseAt).getTime()).toBe(far.getTime());
        const b = await request(app).post(`/api/admin/risk/cases/${block._id}/escalate`).set(auth(risk.token)).send({ reason: 'Needs a second opinion' });
        expect(b.body.case.autoReleaseAt).toBeNull();
    });

    it('admins decide escalations and cannot escalate further', async () => {
        const { boss } = await staffPair();
        const asha = await signup('asha@example.com');
        const riskCase = await openCase(asha.id);
        const res = await request(app).post(`/api/admin/risk/cases/${riskCase._id}/escalate`).set(auth(boss.token))
            .send({ reason: 'Needs a second opinion' });
        expect(res.status).toBe(400);
    });
});

describe('GET /api/admin/audit-logs date filter', () => {
    it('filters by an IST day range, inclusive of the whole "to" day, and validates input', async () => {
        const boss = await signup('admin@example.com');
        await User.updateOne({ _id: boss.id }, { $set: { role: 'admin', 'totp.enabled': true } });
        await AuditLog.deleteMany({});
        await AuditLog.insertMany([
            // 00:30 IST on 10 Sep is still 9 Sep in UTC: a UTC-midnight bound would miss it.
            { action: 'test.a', createdAt: new Date('2026-09-09T19:00:00Z') },
            { action: 'test.b', createdAt: new Date('2026-09-10T18:00:00Z') }, // 23:30 IST, 10 Sep
            { action: 'test.c', createdAt: new Date('2026-09-11T06:00:00Z') },
            { action: 'test.d', createdAt: new Date('2026-09-08T06:00:00Z') },
        ]);

        const res = await request(app).get('/api/admin/audit-logs?action=test.&from=2026-09-10&to=2026-09-10').set(auth(boss.token));
        expect(res.status).toBe(200);
        expect(res.body.entries.map((e) => e.action).sort()).toEqual(['test.a', 'test.b']);

        const open = await request(app).get('/api/admin/audit-logs?action=test.&from=2026-09-10').set(auth(boss.token));
        expect(open.body.entries.map((e) => e.action).sort()).toEqual(['test.a', 'test.b', 'test.c']);

        expect((await request(app).get('/api/admin/audit-logs?from=yesterday').set(auth(boss.token))).status).toBe(400);
        expect((await request(app).get('/api/admin/audit-logs?from=2026-09-11&to=2026-09-10').set(auth(boss.token))).status).toBe(400);
    });
});
