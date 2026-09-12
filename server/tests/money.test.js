import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Payment from '../models/Payment.js';
import Otp from '../models/Otp.js';

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

const WEBHOOK_SECRET = 'test_webhook_secret';
process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;

// Razorpay's SDK must never be hit from a test.
vi.mock('../utils/razorpay.js', async () => {
    const actual = await vi.importActual('../utils/razorpay.js');
    return {
        ...actual,
        razorpayInstance: {
            orders: { create: vi.fn(async (o) => ({ id: `order_${crypto.randomBytes(6).toString('hex')}`, ...o })) },
            payments: { refund: vi.fn(async () => ({ id: 'rfnd_test123' })) },
        },
    };
});

const { buildTestApp } = await import('./helpers/app.js');

let app;
beforeAll(() => { app = buildTestApp(); });

const signup = async (email, password = 'Str0ngPass99') => {
    const res = await request(app).post('/api/auth/signup')
        .send({ firstName: email.split('@')[0], email, password });
    return { token: res.body.accessToken, id: res.body.user._id, agent: request.agent(app) };
};

const fund = (userId, amount) =>
    User.updateOne({ _id: userId }, { $set: { accountBalance: amount } });

const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe('POST /api/transactions/transfer', () => {
    let alice; let bob;

    beforeEach(async () => {
        alice = await signup('alice@example.com');
        bob = await signup('bob@example.com');
        await fund(alice.id, 1000);
    });

    it('moves money and reports the new balance', async () => {
        const res = await request(app).post('/api/transactions/transfer')
            .set(auth(alice.token))
            .send({ recipientId: bob.id, amount: 300 });

        expect(res.status).toBe(200);
        expect(res.body.balance).toBe(700);

        expect((await User.findById(alice.id)).accountBalance).toBe(700);
        expect((await User.findById(bob.id)).accountBalance).toBe(300);
    });

    it('rejects a self-transfer', async () => {
        const res = await request(app).post('/api/transactions/transfer')
            .set(auth(alice.token))
            .send({ recipientId: alice.id, amount: 100 });

        expect(res.status).toBe(400);
        expect((await User.findById(alice.id)).accountBalance).toBe(1000);
    });

    it.each([
        ['malformed id', { recipientId: 'nope', amount: 10 }],
        ['operator amount', { recipientId: null, amount: { $gt: 0 } }],
        ['negative', { recipientId: null, amount: -50 }],
        ['zero', { recipientId: null, amount: 0 }],
        ['non-numeric', { recipientId: null, amount: 'abc' }],
        ['sub-paise', { recipientId: null, amount: 10.999 }],
    ])('rejects %s with 400', async (_label, body) => {
        const res = await request(app).post('/api/transactions/transfer')
            .set(auth(alice.token))
            .send({ ...body, recipientId: body.recipientId ?? bob.id });

        expect(res.status).toBe(400);
        expect((await User.findById(alice.id)).accountBalance).toBe(1000);
    });

    it('refuses to overdraw', async () => {
        const res = await request(app).post('/api/transactions/transfer')
            .set(auth(alice.token))
            .send({ recipientId: bob.id, amount: 5000 });

        expect(res.status).toBe(400);
        expect((await User.findById(alice.id)).accountBalance).toBe(1000);
    });

    it('charges once for a repeated idempotency key', async () => {
        const key = 'dup-key-1';
        const body = { recipientId: bob.id, amount: 100, idempotencyKey: key };

        const first = await request(app).post('/api/transactions/transfer').set(auth(alice.token)).send(body);
        const second = await request(app).post('/api/transactions/transfer').set(auth(alice.token)).send(body);

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(second.body.duplicate).toBe(true);

        expect((await User.findById(alice.id)).accountBalance).toBe(900);
        expect((await User.findById(bob.id)).accountBalance).toBe(100);
    });

    /**
     * Regression: `skip2FA` was read straight from the request body, so any
     * client could bypass the transfer challenge by sending it.
     */
    it('ignores a client-supplied skip2FA flag', async () => {
        // Push Alice over the daily threshold for transfers to Bob.
        await Transaction.insertMany(
            Array.from({ length: 5 }, (_, i) => ({
                userId: alice.id, recipientId: bob.id, description: 'seed',
                amount: 1, type: 'Debit', category: 'Transfer',
                invoiceId: `SEED${i}${Date.now()}`,
            }))
        );

        const res = await request(app).post('/api/transactions/transfer')
            .set(auth(alice.token))
            .send({ recipientId: bob.id, amount: 100, skip2FA: true });

        // The challenge must still be raised.
        expect(res.status).toBe(403);
        expect(res.body.require2FA).toBe(true);
        expect((await User.findById(alice.id)).accountBalance).toBe(1000);
    });

    it('conserves money under concurrent transfers through the API', async () => {
        const results = await Promise.all(
            Array.from({ length: 6 }, () =>
                request(app).post('/api/transactions/transfer')
                    .set(auth(alice.token))
                    .send({ recipientId: bob.id, amount: 400 })
                    .then((r) => r.status)
            )
        );

        expect(results.filter((s) => s === 200)).toHaveLength(2); // 1000 covers two
        const [a, b] = await Promise.all([User.findById(alice.id), User.findById(bob.id)]);
        expect(a.accountBalance + b.accountBalance).toBe(1000);
    });
});

describe('transfer 2FA', () => {
    let alice; let bob;

    beforeEach(async () => {
        alice = await signup('alice@example.com');
        bob = await signup('bob@example.com');
        await fund(alice.id, 1000);
        await Transaction.insertMany(
            Array.from({ length: 5 }, (_, i) => ({
                userId: alice.id, recipientId: bob.id, description: 'seed',
                amount: 1, type: 'Debit', category: 'Transfer',
                invoiceId: `S${i}${Date.now()}`,
            }))
        );
    });

    it('binds the challenge to the exact recipient and amount', async () => {
        await request(app).post('/api/transactions/transfer')
            .set(auth(alice.token))
            .send({ recipientId: bob.id, amount: 250 });

        const challenge = await Otp.findOne({ purpose: 'transfer' });
        expect(challenge).toBeTruthy();
        // Regression: the amount used to live in the browser's localStorage,
        // where the user could change it after approving the code.
        expect(challenge.context.amount).toBe(250);
        expect(challenge.context.recipientId).toBe(String(bob.id));
        expect(challenge.otpHash).toMatch(/^\$2[aby]\$/);
    });

    it('does not accept a login OTP as transfer authorisation', async () => {
        await request(app).post('/api/transactions/transfer')
            .set(auth(alice.token)).send({ recipientId: bob.id, amount: 250 });

        // Swap the pending challenge's purpose to 'login'.
        await Otp.updateMany({}, { $set: { purpose: 'login' } });

        const res = await request(app).post('/api/transactions/verify-otp')
            .set(auth(alice.token)).send({ otp: '123456' });

        expect(res.status).toBe(400);
        expect((await User.findById(alice.id)).accountBalance).toBe(1000);
    });

    it('caps verification attempts', async () => {
        await request(app).post('/api/transactions/transfer')
            .set(auth(alice.token)).send({ recipientId: bob.id, amount: 250 });

        for (let i = 0; i < 5; i++) {
            await request(app).post('/api/transactions/verify-otp')
                .set(auth(alice.token)).send({ otp: '000000' });
        }

        const res = await request(app).post('/api/transactions/verify-otp')
            .set(auth(alice.token)).send({ otp: '000000' });

        expect([429, 400]).toContain(res.status);
        expect((await User.findById(alice.id)).accountBalance).toBe(1000);
    });
});

describe('POST /api/transactions/add', () => {
    let alice;
    beforeEach(async () => {
        alice = await signup('alice@example.com');
        await fund(alice.id, 500);
    });

    /**
     * Regression: any `type` other than 'Debit' was treated as a Credit, so
     * `type: "whatever"` minted balance.
     */
    it('rejects an unrecognised type instead of crediting', async () => {
        const res = await request(app).post('/api/transactions/add')
            .set(auth(alice.token))
            .send({ description: 'free money', amount: 99999, type: 'whatever' });

        expect(res.status).toBe(400);
        expect((await User.findById(alice.id)).accountBalance).toBe(500);
    });

    it('honours an explicitly chosen category', async () => {
        const res = await request(app).post('/api/transactions/add')
            .set(auth(alice.token))
            .send({ description: 'Lunch', amount: 100, type: 'expense', category: 'Food' });

        expect(res.status).toBe(201);
        // Regression: the server discarded the user's choice and used the AI's.
        expect(res.body.transaction.category).toBe('Food');
    });

    it('will not let a manual expense overdraw', async () => {
        const res = await request(app).post('/api/transactions/add')
            .set(auth(alice.token))
            .send({ description: 'Big', amount: 900, type: 'expense' });

        expect(res.status).toBe(400);
        expect((await User.findById(alice.id)).accountBalance).toBe(500);
    });
});

describe('GET /api/transactions/recent-recipients', () => {
    let alice; let bob; let carol;

    const transfer = (from, toId, amount) =>
        request(app).post('/api/transactions/transfer')
            .set(auth(from.token))
            .send({ recipientId: toId, amount });

    beforeEach(async () => {
        alice = await signup('alice@example.com');
        bob = await signup('bob@example.com');
        carol = await signup('carol@example.com');
        await fund(alice.id, 5000);
    });

    it('requires authentication', async () => {
        const res = await request(app).get('/api/transactions/recent-recipients');
        expect(res.status).toBe(401);
    });

    it('is empty for a user who has never sent money', async () => {
        const res = await request(app).get('/api/transactions/recent-recipients')
            .set(auth(alice.token));

        expect(res.status).toBe(200);
        expect(res.body.recipients).toEqual([]);
    });

    it('returns each recipient once, most recently paid first', async () => {
        await transfer(alice, bob.id, 100);
        await transfer(alice, carol.id, 100);
        // Paying Bob again should move him to the front, not add a duplicate.
        await transfer(alice, bob.id, 50);

        const res = await request(app).get('/api/transactions/recent-recipients')
            .set(auth(alice.token));

        expect(res.status).toBe(200);
        expect(res.body.recipients).toHaveLength(2);
        expect(res.body.recipients.map((r) => r._id)).toEqual([bob.id, carol.id]);
        expect(res.body.recipients[0].lastAmount).toBe(50);
    });

    it("never exposes another user's recipients", async () => {
        await transfer(alice, bob.id, 100);

        const res = await request(app).get('/api/transactions/recent-recipients')
            .set(auth(carol.token));

        expect(res.status).toBe(200);
        expect(res.body.recipients).toEqual([]);
    });

    it('omits a recipient whose account no longer exists', async () => {
        await transfer(alice, bob.id, 100);
        await transfer(alice, carol.id, 100);
        await User.deleteOne({ _id: bob.id });

        const res = await request(app).get('/api/transactions/recent-recipients')
            .set(auth(alice.token));

        expect(res.status).toBe(200);
        expect(res.body.recipients.map((r) => r._id)).toEqual([carol.id]);
    });

    it('caps the limit rather than trusting the query string', async () => {
        await transfer(alice, bob.id, 100);

        const res = await request(app).get('/api/transactions/recent-recipients?limit=9999')
            .set(auth(alice.token));

        expect(res.status).toBe(200);
        expect(res.body.recipients.length).toBeLessThanOrEqual(10);
    });
});

describe('payments and webhooks', () => {
    let alice;
    beforeEach(async () => { alice = await signup('alice@example.com'); });

    const sign = (body) => crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');

    const capturedEvent = (orderId) => JSON.stringify({
        event: 'payment.captured',
        payload: { payment: { entity: { id: 'pay_test_1', order_id: orderId } } },
    });

    const createOrder = async (amount = 1000) => {
        const res = await request(app).post('/api/payments/create-order')
            .set(auth(alice.token)).send({ amount });
        return res.body.orderId;
    };

    it('rejects a webhook with a bad signature', async () => {
        const body = capturedEvent('order_x');
        const res = await request(app).post('/api/payments/webhook')
            .set('Content-Type', 'application/json')
            .set('x-razorpay-signature', 'deadbeef')
            .send(body);

        expect(res.status).toBe(400);
    });

    it('rejects a webhook with no signature', async () => {
        const body = capturedEvent('order_x');
        const res = await request(app).post('/api/payments/webhook')
            .set('Content-Type', 'application/json')
            .send(body);

        expect(res.status).toBe(400);
    });

    /**
     * Regression: the HMAC was computed over `JSON.stringify(req.body)` after
     * express.json() had already parsed it, so it never matched the bytes
     * Razorpay actually sent and every genuine webhook was rejected.
     */
    it('accepts a webhook signed over the raw body and credits once', async () => {
        const orderId = await createOrder(1000);
        const body = capturedEvent(orderId);

        const res = await request(app).post('/api/payments/webhook')
            .set('Content-Type', 'application/json')
            .set('x-razorpay-signature', sign(body))
            .send(body);

        expect(res.status).toBe(200);
        expect((await User.findById(alice.id)).accountBalance).toBe(1000);
    });

    /**
     * Regression: /verify and the webhook each read `status`, then wrote it —
     * so a webhook arriving during the browser's verify call credited twice.
     */
    it('credits exactly once when the webhook is delivered repeatedly', async () => {
        const orderId = await createOrder(1000);
        const body = capturedEvent(orderId);
        const signature = sign(body);

        await Promise.all(
            Array.from({ length: 5 }, () =>
                request(app).post('/api/payments/webhook')
                    .set('Content-Type', 'application/json')
                    .set('x-razorpay-signature', signature)
                    .send(body)
            )
        );

        expect((await User.findById(alice.id)).accountBalance).toBe(1000);
        expect(await Transaction.countDocuments({ category: 'Top Up' })).toBe(1);
    });

    it('credits once when verify and the webhook race each other', async () => {
        const orderId = await createOrder(1000);
        const body = capturedEvent(orderId);

        const signature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'test_key_secret')
            .update(`${orderId}|pay_test_1`)
            .digest('hex');

        await Promise.all([
            request(app).post('/api/payments/webhook')
                .set('Content-Type', 'application/json')
                .set('x-razorpay-signature', sign(body))
                .send(body),
            request(app).post('/api/payments/verify')
                .set(auth(alice.token))
                .send({
                    razorpay_order_id: orderId,
                    razorpay_payment_id: 'pay_test_1',
                    razorpay_signature: signature,
                }),
        ]);

        expect((await User.findById(alice.id)).accountBalance).toBe(1000);
        expect(await Transaction.countDocuments({ category: 'Top Up' })).toBe(1);
    });

    it('rejects a non-numeric order amount', async () => {
        const res = await request(app).post('/api/payments/create-order')
            .set(auth(alice.token)).send({ amount: 'abc' });

        expect(res.status).toBe(400);
        expect(await Payment.countDocuments({})).toBe(0);
    });

    it('does not let one user verify another user\'s order', async () => {
        const orderId = await createOrder(500);
        const mallory = await signup('mallory@example.com');

        const signature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'test_key_secret')
            .update(`${orderId}|pay_test_1`)
            .digest('hex');

        const res = await request(app).post('/api/payments/verify')
            .set(auth(mallory.token))
            .send({
                razorpay_order_id: orderId,
                razorpay_payment_id: 'pay_test_1',
                razorpay_signature: signature,
            });

        expect(res.status).toBe(404);
        expect((await User.findById(mallory.id)).accountBalance).toBe(0);
    });
});

describe('authorization boundaries', () => {
    it('never exposes other users\' PII through the directory', async () => {
        await signup('alice@example.com');
        const bob = await signup('bob@example.com');
        await fund(bob.id, 4242);

        const alice = await request(app).post('/api/auth/login')
            .send({ email: 'alice@example.com', password: 'Str0ngPass99' });

        const res = await request(app).get('/api/users/all').set(auth(alice.body.accessToken));

        expect(res.status).toBe(200);
        const body = JSON.stringify(res.body);
        // Regression: this endpoint returned emails, balances, login IPs and
        // raw FCM device tokens for every user in the database.
        expect(body).not.toContain('bob@example.com');
        expect(body).not.toContain('4242');
        expect(body).not.toContain('fcmTokens');
        expect(body).not.toContain('lastLoginLocation');
    });

    it('scopes transaction history to the caller', async () => {
        const alice = await signup('alice@example.com');
        const bob = await signup('bob@example.com');

        await Transaction.create({
            userId: bob.id, description: 'bob secret', amount: 99,
            type: 'Debit', category: 'Food', invoiceId: `X${Date.now()}`,
        });

        const res = await request(app).get('/api/transactions/history').set(auth(alice.token));

        expect(res.status).toBe(200);
        expect(res.body.transactions).toHaveLength(0);
    });
});
