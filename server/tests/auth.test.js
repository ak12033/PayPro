import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import User from '../models/User.js';
import Otp from '../models/Otp.js';
import Session from '../models/Session.js';
import AuditLog, { AUDIT } from '../models/AuditLog.js';

// Never send real mail from a test run.
vi.mock('../utils/sendOtp.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
// The AI service is not under test here.
vi.mock('../utils/fastapiClient.js', () => ({
    categorizeTransaction: vi.fn().mockResolvedValue({ category: 'Others', icon: 'CircleDollarSign', confidence_score: 0 }),
    checkFraud: vi.fn().mockResolvedValue({ risk_score: 0, risk_level: 'low', reason: 'test' }),
    default: {},
}));
// Socket emits require an initialised io instance.
vi.mock('../utils/socket.js', () => ({
    emitToUser: vi.fn(),
    getIO: vi.fn(),
    initSocket: vi.fn(),
    default: {},
}));

const { buildTestApp } = await import('./helpers/app.js');

let app;
beforeAll(() => { app = buildTestApp(); });

const VALID = {
    firstName: 'Alice',
    lastName: 'Smith',
    email: 'alice@example.com',
    password: 'Str0ngPass99',
};

describe('POST /api/auth/signup', () => {
    it('creates an account and returns an access token', async () => {
        const res = await request(app).post('/api/auth/signup').send(VALID);

        expect(res.status).toBe(201);
        expect(res.body.accessToken).toBeTruthy();
        // The password hash must never appear in a response body.
        expect(JSON.stringify(res.body)).not.toContain('password');
    });

    it('sets an httpOnly refresh cookie scoped to the whole site', async () => {
        const res = await request(app).post('/api/auth/signup').send(VALID);

        const cookie = res.headers['set-cookie'].find((c) => c.startsWith('refreshToken='));
        expect(cookie).toContain('HttpOnly');
        // Regression: a narrow Path=/api/auth/refresh meant the cookie was
        // never sent to /auth/logout, so logout could not revoke the session.
        expect(cookie).toContain('Path=/');
    });

    it.each([
        ['too short', 'Ab1'],
        ['no uppercase', 'weakpass123'],
        ['no digit', 'WeakPassword'],
        ['common', 'Password123'],
    ])('rejects a %s password', async (_label, password) => {
        const res = await request(app).post('/api/auth/signup').send({ ...VALID, password });
        expect(res.status).toBe(400);
    });

    it('rejects a duplicate email with 409', async () => {
        await request(app).post('/api/auth/signup').send(VALID);
        const res = await request(app).post('/api/auth/signup').send(VALID);
        expect(res.status).toBe(409);
    });

    it('normalises the email to lowercase', async () => {
        await request(app).post('/api/auth/signup').send({ ...VALID, email: 'MiXeD@Example.COM' });
        expect(await User.findOne({ email: 'mixed@example.com' })).toBeTruthy();
    });
});

describe('POST /api/auth/login', () => {
    beforeAll(async () => {});

    const signup = () => request(app).post('/api/auth/signup').send(VALID);

    it('rejects a NoSQL operator payload instead of matching a user', async () => {
        await signup();

        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: { $ne: null }, password: { $ne: null } });

        expect(res.status).toBe(400);
        expect(res.body.accessToken).toBeUndefined();
    });

    it('locks the account after repeated failures', async () => {
        await signup();

        for (let i = 0; i < 8; i++) {
            await request(app).post('/api/auth/login').send({ email: VALID.email, password: 'WrongPass123' });
        }

        const res = await request(app).post('/api/auth/login').send(VALID);
        expect(res.status).toBe(429);
    });

    it('records failed attempts in the audit log', async () => {
        await signup();
        await request(app).post('/api/auth/login').send({ email: VALID.email, password: 'WrongPass123' });

        // audit() is fire-and-forget; give the write a tick to land.
        await new Promise((r) => setTimeout(r, 50));

        const entry = await AuditLog.findOne({ action: AUDIT.LOGIN_FAILED });
        expect(entry).toBeTruthy();
        expect(entry.outcome).toBe('failure');
    });

    it('never stores an OTP in plaintext', async () => {
        await signup();
        // Force the 2FA branch by marking the account as 2FA-enabled.
        await User.updateOne({ email: VALID.email }, { $set: { 'preferences.twoFactorAuth': true } });

        const res = await request(app).post('/api/auth/login').send(VALID);
        expect(res.status).toBe(403);
        expect(res.body.require2FA).toBe(true);

        const otp = await Otp.findOne({ email: VALID.email, purpose: 'login' });
        expect(otp).toBeTruthy();
        expect(otp.otpHash).toMatch(/^\$2[aby]\$/); // bcrypt
        expect(otp.purpose).toBe('login');
    });
});

describe('token lifecycle', () => {
    it('logout revokes the session server-side', async () => {
        const agent = request.agent(app);
        await agent.post('/api/auth/signup').send(VALID);

        expect(await Session.countDocuments({})).toBe(1);

        const res = await agent.post('/api/auth/logout');
        expect(res.status).toBe(200);

        // Regression: the old cookie Path meant the refresh token never reached
        // this handler, so the session survived logout for its full 7 days.
        expect(await Session.countDocuments({})).toBe(0);
    });

    it('refresh rotates the refresh token and retires the old session row', async () => {
        const agent = request.agent(app);
        await agent.post('/api/auth/signup').send(VALID);

        const original = await Session.findOne({ isValid: true }).lean();

        const first = await agent.get('/api/auth/refresh');
        expect(first.status).toBe(200);
        expect(first.body.accessToken).toBeTruthy();

        /**
         * Asserting on the access token string would be wrong: two JWTs minted
         * in the same second carry an identical `iat` and are therefore
         * byte-identical. What actually has to rotate is the refresh token, so
         * that is what we check.
         */
        const consumed = await Session.findById(original._id).lean();
        expect(consumed.isValid).toBe(false);
        expect(consumed.rotatedAt).toBeTruthy();

        const replacement = await Session.findOne({ isValid: true }).lean();
        expect(replacement).toBeTruthy();
        expect(replacement.refreshTokenHash).not.toBe(original.refreshTokenHash);
        // Rotation stays inside the same family so reuse detection can trace it.
        expect(replacement.familyId).toBe(original.familyId);
    });

    it('revokes the whole session family when a rotated token is replayed', async () => {
        const agent = request.agent(app);
        const signup = await agent.post('/api/auth/signup').send(VALID);

        // The plaintext token only ever exists in the Set-Cookie header — the
        // database stores its SHA-256 — so capture it here to replay later.
        const stolenCookie = signup.headers['set-cookie']
            .find((c) => c.startsWith('refreshToken='))
            .split(';')[0];

        // The agent rotates it away with a normal refresh.
        const rotated = await agent.get('/api/auth/refresh');
        expect(rotated.status).toBe(200);

        // Age the rotation past the double-refresh grace window, so the replay
        // is treated as an attack rather than a benign two-tab race.
        await Session.updateMany(
            { rotatedAt: { $ne: null } },
            { $set: { rotatedAt: new Date(Date.now() - 60_000) } }
        );

        expect(await Session.countDocuments({})).toBeGreaterThan(0);

        // Replay the consumed token.
        const replay = await request(app)
            .get('/api/auth/refresh')
            .set('Cookie', [stolenCookie]);

        expect(replay.status).toBe(401);

        // Reuse detection must burn the entire family, not just the one token,
        // so an attacker holding a captured token cannot keep the chain alive.
        expect(await Session.countDocuments({})).toBe(0);
    });

    it('rejects a refresh with no cookie', async () => {
        const res = await request(app).get('/api/auth/refresh');
        expect(res.status).toBe(401);
    });
});

describe('protected routes', () => {
    it.each([
        ['get', '/api/users/profile'],
        ['get', '/api/users/all'],
        ['get', '/api/transactions/history'],
        ['post', '/api/transactions/transfer'],
        ['post', '/api/transactions/verify-otp'],
        ['post', '/api/transactions/resend-otp'],
        ['get', '/api/security/sessions'],
        ['post', '/api/payments/create-order'],
    ])('%s %s requires authentication', async (method, path) => {
        const res = await request(app)[method](path).send({});
        expect(res.status).toBe(401);
    });

    it('rejects a structurally invalid token with TOKEN_INVALID, not TOKEN_EXPIRED', async () => {
        const res = await request(app)
            .get('/api/users/profile')
            .set('Authorization', 'Bearer not-a-real-jwt');

        expect(res.status).toBe(401);
        // The distinction matters: the client only attempts a silent refresh on
        // TOKEN_EXPIRED. Returning it for a forged token caused a refresh loop.
        expect(res.body.code).toBe('TOKEN_INVALID');
    });
});
