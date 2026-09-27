import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import User from '../models/User.js';
import AuditLog, { AUDIT } from '../models/AuditLog.js';

vi.mock('../utils/sendOtp.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../utils/fastapiClient.js', () => ({
    categorizeTransaction: vi.fn().mockResolvedValue({ category: 'Others', icon: 'CircleDollarSign', confidence_score: 0 }),
    checkFraud: vi.fn().mockResolvedValue({ risk_score: 0, risk_level: 'low', reason: 'test' }),
    default: {},
}));
vi.mock('../utils/socket.js', () => ({
    emitToUser: vi.fn(), getIO: vi.fn(), initSocket: vi.fn(), default: {},
}));

/**
 * plan.md §31.2.7. The gate is skipped under the test runner by default (see
 * middlewares/requireVerifiedEmail.js) — this suite is the one place that
 * turns it back on, the same way rateLimitStore.test.js does for limiters.
 * Read at request time, so assigning it here (not before an import) is enough.
 */
process.env.ENFORCE_EMAIL_VERIFICATION = 'true';

const { buildTestApp } = await import('./helpers/app.js');
const sendOtp = (await import('../utils/sendOtp.js')).default;

let app;
beforeAll(() => { app = buildTestApp(); });
beforeEach(() => sendOtp.mockClear());

const PASSWORD = 'Str0ngPass99';
const auth = (t) => ({ Authorization: `Bearer ${t}` });

const signup = async (email) => {
    const res = await request(app).post('/api/auth/signup')
        .send({ firstName: email.split('@')[0], email, password: PASSWORD });
    return { token: res.body.accessToken, id: res.body.user._id, body: res.body };
};

/** The code the mocked mailer was last asked to deliver for this purpose. */
const lastCode = (purpose) => {
    const call = [...sendOtp.mock.calls].reverse().find(([, , p]) => p === purpose);
    return call?.[1];
};

describe('signup issues a verification code and starts unverified', () => {
    it('reports emailVerified:false and emails a code', async () => {
        const alice = await signup('ev-signup@example.com');

        expect(alice.body.user.emailVerified).toBe(false);
        expect(lastCode('email_verification')).toMatch(/^\d{6}$/);
        expect((await User.findById(alice.id)).emailVerified).toBe(false);
    });
});

describe('outgoing money movement waits for verification', () => {
    it('refuses a transfer and a top-up order with EMAIL_NOT_VERIFIED', async () => {
        const alice = await signup('ev-gate-sender@example.com');
        const bob = await signup('ev-gate-recipient@example.com');
        await User.updateOne({ _id: alice.id }, { $set: { accountBalance: 1000, balanceMinor: 100000 } });

        const transfer = await request(app).post('/api/transactions/transfer')
            .set(auth(alice.token)).send({ recipientId: bob.id, amount: 100 });
        expect(transfer.status).toBe(403);
        expect(transfer.body.code).toBe('EMAIL_NOT_VERIFIED');

        const order = await request(app).post('/api/payments/create-order')
            .set(auth(alice.token)).send({ amount: 100 });
        expect(order.status).toBe(403);
        expect(order.body.code).toBe('EMAIL_NOT_VERIFIED');

        expect((await User.findById(alice.id)).accountBalance).toBe(1000);
    });

    it('leaves everything that is not money movement available', async () => {
        const alice = await signup('ev-browse@example.com');
        const profile = await request(app).get('/api/users/profile').set(auth(alice.token));
        expect(profile.status).toBe(200);
        const history = await request(app).get('/api/transactions/history').set(auth(alice.token));
        expect(history.status).toBe(200);
    });

    it('unlocks on the very next request after verifying, with the same access token', async () => {
        const alice = await signup('ev-unlock-sender@example.com');
        const bob = await signup('ev-unlock-recipient@example.com');
        await User.updateOne({ _id: alice.id }, { $set: { accountBalance: 1000, balanceMinor: 100000 } });
        // bob's signup sent the most recent email, so get alice a fresh one.
        const resend = await request(app).post('/api/auth/verify-email/send').set(auth(alice.token));
        expect(resend.status).toBe(200);
        const aliceCode = lastCode('email_verification');

        const verify = await request(app).post('/api/auth/verify-email')
            .set(auth(alice.token)).send({ otp: aliceCode });
        expect(verify.status).toBe(200);
        expect(verify.body.emailVerified).toBe(true);

        const transfer = await request(app).post('/api/transactions/transfer')
            .set(auth(alice.token)).send({ recipientId: bob.id, amount: 100 });
        expect(transfer.status).toBe(200);

        await new Promise((r) => setTimeout(r, 50));
        expect(await AuditLog.findOne({ action: AUDIT.EMAIL_VERIFIED, userId: alice.id })).toBeTruthy();
    });
});

describe('the verification code itself', () => {
    it('rejects a wrong code and counts the attempt', async () => {
        const alice = await signup('ev-wrong@example.com');
        const code = lastCode('email_verification');
        const wrong = code === '111111' ? '222222' : '111111';

        const res = await request(app).post('/api/auth/verify-email')
            .set(auth(alice.token)).send({ otp: wrong });

        expect(res.status).toBe(401);
        expect((await User.findById(alice.id)).emailVerified).toBe(false);
    });

    it("cannot verify one account with another account's code", async () => {
        const alice = await signup('ev-cross-a@example.com');
        const aliceCode = lastCode('email_verification');
        const bob = await signup('ev-cross-b@example.com');

        const res = await request(app).post('/api/auth/verify-email')
            .set(auth(bob.token)).send({ otp: aliceCode });

        expect(res.status).not.toBe(200);
        expect((await User.findById(bob.id)).emailVerified).toBe(false);
        expect((await User.findById(alice.id)).emailVerified).toBe(false);
    });

    it('is single-use', async () => {
        const alice = await signup('ev-single@example.com');
        const code = lastCode('email_verification');

        await request(app).post('/api/auth/verify-email').set(auth(alice.token)).send({ otp: code });
        await User.updateOne({ _id: alice.id }, { $set: { emailVerified: false } });
        const replay = await request(app).post('/api/auth/verify-email').set(auth(alice.token)).send({ otp: code });

        expect(replay.status).toBe(400);
    });

    it('answers an already-verified account without sending anything', async () => {
        const alice = await signup('ev-already@example.com');
        await request(app).post('/api/auth/verify-email')
            .set(auth(alice.token)).send({ otp: lastCode('email_verification') });
        sendOtp.mockClear();

        const res = await request(app).post('/api/auth/verify-email/send').set(auth(alice.token));
        expect(res.status).toBe(200);
        expect(res.body.emailVerified).toBe(true);
        expect(sendOtp).not.toHaveBeenCalled();
    });
});

describe('other flows that already prove inbox control', () => {
    it('a completed password reset marks the address verified', async () => {
        const alice = await signup('ev-reset@example.com');

        await request(app).post('/api/auth/forgot-password').send({ email: 'ev-reset@example.com' });
        const reset = await request(app).post('/api/auth/reset-password').send({
            email: 'ev-reset@example.com', otp: lastCode('password_reset'), password: 'N3wStr0ngPass!',
        });

        expect(reset.status).toBe(200);
        expect((await User.findById(alice.id)).emailVerified).toBe(true);
    });

    it('changing the email address resets verification', async () => {
        const alice = await signup('ev-change@example.com');
        await request(app).post('/api/auth/verify-email')
            .set(auth(alice.token)).send({ otp: lastCode('email_verification') });
        expect((await User.findById(alice.id)).emailVerified).toBe(true);

        const res = await request(app).put('/api/users/update-profile').set(auth(alice.token))
            .send({ email: 'ev-changed@example.com', currentPassword: PASSWORD });

        expect(res.status).toBe(200);
        const after = await User.findById(alice.id);
        expect(after.email).toBe('ev-changed@example.com');
        expect(after.emailVerified).toBe(false);
    });
});
