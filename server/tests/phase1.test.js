import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Otp from '../models/Otp.js';
import Session from '../models/Session.js';
import { assertTransition } from '../services/transactionStateService.js';
import { LedgerError } from '../services/ledgerService.js';

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

/**
 * Dynamic, and deliberately after the `process.env.RAZORPAY_WEBHOOK_SECRET`
 * assignment above: `period.js` imports `config/env.js`, which reads
 * `process.env` (via `dotenv.config()`) exactly once, the first time anything
 * imports it, and caches the result. A *static* `import` of `period.js` at the
 * top of this file would be hoisted ahead of the assignment above, load
 * config.js early, and bake in whatever `server/.env` happens to define
 * locally instead of this file's test value — exactly the failure mode this
 * avoids.
 */
const { startOfDayIST, monthKeyIST, monthBoundsIST } = await import('../utils/period.js');
const { buildTestApp } = await import('./helpers/app.js');

let app;
beforeAll(() => { app = buildTestApp(); });

const signup = async (email, password = 'Str0ngPass99') => {
    const res = await request(app).post('/api/auth/signup')
        .send({ firstName: email.split('@')[0], email, password });
    return { token: res.body.accessToken, id: res.body.user._id, email };
};

const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe('transactionStateService: assertTransition', () => {
    it('allows a legal transition', () => {
        expect(() => assertTransition('PENDING', 'SUCCESS')).not.toThrow();
    });

    it('refuses an illegal transition', () => {
        expect(() => assertTransition('SUCCESS', 'PENDING')).toThrow(LedgerError);
    });

    it('refuses any transition out of a terminal state', () => {
        expect(() => assertTransition('FAILED', 'SUCCESS')).toThrow(LedgerError);
    });
});

describe('utils/period: IST boundaries', () => {
    it('computes the start of the IST day for a UTC instant just after IST midnight', () => {
        // 2024-01-15T18:30:00Z is 2024-01-16T00:00:00 IST exactly.
        const instant = new Date('2024-01-15T18:31:00.000Z');
        const start = startOfDayIST(instant);
        expect(start.toISOString()).toBe('2024-01-15T18:30:00.000Z');
    });

    it('keys a month by its IST calendar month, not UTC', () => {
        // 2024-01-31T19:00:00Z is 2024-02-01T00:30 IST — February, not January.
        const instant = new Date('2024-01-31T19:00:00.000Z');
        expect(monthKeyIST(instant)).toBe('2024-02');
    });

    it('produces month bounds that fully cover every timestamp in that IST month', () => {
        const { start, end } = monthBoundsIST('2024-02');
        const lastDayOfFeb = new Date('2024-02-29T18:00:00.000Z'); // Feb 29 23:30 IST (2024 is a leap year)
        expect(lastDayOfFeb >= start && lastDayOfFeb < end).toBe(true);
    });
});

describe('categories', () => {
    it('lists the canonical category registry', async () => {
        const alice = await signup('cat-alice@example.com');
        const res = await request(app).get('/api/transactions/categories').set(auth(alice.token));

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.categories)).toBe(true);
        expect(res.body.categories.map((c) => c.name)).toContain('Groceries');
        expect(res.body.categories.map((c) => c.name)).toContain('Rent');
    });

    it('lets a user correct a category', async () => {
        const alice = await signup('cat-correct@example.com');

        const added = await request(app).post('/api/transactions/add')
            .set(auth(alice.token))
            .send({ description: 'Lunch', amount: 100, type: 'expense', category: 'Food' });

        const txId = added.body.transaction._id;

        const res = await request(app).patch(`/api/transactions/${txId}/category`)
            .set(auth(alice.token))
            .send({ category: 'Groceries' });

        expect(res.status).toBe(200);
        expect(res.body.transaction.category).toBe('Groceries');
        expect((await Transaction.findById(txId)).categorySource).toBe('user');
    });

    it('refuses to recategorise a system transaction', async () => {
        const alice = await signup('cat-system-a@example.com');
        const bob = await signup('cat-system-b@example.com');
        await User.updateOne({ _id: alice.id }, { $set: { accountBalance: 500, balanceMinor: 50000 } });

        const transfer = await request(app).post('/api/transactions/transfer')
            .set(auth(alice.token))
            .send({ recipientId: bob.id, amount: 100 });

        const res = await request(app).patch(`/api/transactions/${transfer.body.senderTransactionId}/category`)
            .set(auth(alice.token))
            .send({ category: 'Food' });

        expect(res.status).toBe(400);
    });

    it('refuses an unrecognised category', async () => {
        const alice = await signup('cat-bad@example.com');
        const added = await request(app).post('/api/transactions/add')
            .set(auth(alice.token))
            .send({ description: 'Lunch', amount: 100, type: 'expense', category: 'Food' });

        const res = await request(app).patch(`/api/transactions/${added.body.transaction._id}/category`)
            .set(auth(alice.token))
            .send({ category: 'NotARealCategory' });

        expect(res.status).toBe(400);
    });

    it("never lets one user recategorise another user's transaction", async () => {
        const alice = await signup('cat-owner@example.com');
        const mallory = await signup('cat-mallory@example.com');

        const added = await request(app).post('/api/transactions/add')
            .set(auth(alice.token))
            .send({ description: 'Lunch', amount: 100, type: 'expense', category: 'Food' });

        const res = await request(app).patch(`/api/transactions/${added.body.transaction._id}/category`)
            .set(auth(mallory.token))
            .send({ category: 'Groceries' });

        expect(res.status).toBe(404);
    });
});

describe('manual transactions do not affect the balance-invariant surfaces', () => {
    it('is excluded from the wallet summary', async () => {
        const alice = await signup('summary-alice@example.com');

        await request(app).post('/api/transactions/add')
            .set(auth(alice.token))
            .send({ description: 'Cash lunch', amount: 5000, type: 'expense' });

        const res = await request(app).get('/api/transactions/summary').set(auth(alice.token));

        expect(res.status).toBe(200);
        expect(res.body.sent).toBe(0);
    });

    it('still appears in Activity history', async () => {
        const alice = await signup('history-alice@example.com');

        await request(app).post('/api/transactions/add')
            .set(auth(alice.token))
            .send({ description: 'Cash lunch', amount: 250, type: 'expense' });

        const res = await request(app).get('/api/transactions/history').set(auth(alice.token));

        expect(res.status).toBe(200);
        expect(res.body.transactions).toHaveLength(1);
        expect(res.body.transactions[0].settlement).toBe('none');
    });
});

describe('POST /api/auth/forgot-password + reset-password', () => {
    it('resets the password and revokes every session', async () => {
        const alice = await signup('reset-alice@example.com');

        const forgot = await request(app).post('/api/auth/forgot-password')
            .send({ email: alice.email });
        expect(forgot.status).toBe(200);

        const record = await Otp.findOne({ email: alice.email, purpose: 'password_reset' });
        expect(record).toBeTruthy();

        // The real OTP is only known to sendOtp (mocked above), so drive the
        // reset through a fresh code we control by re-hashing it onto the record.
        const bcrypt = (await import('bcryptjs')).default;
        const knownOtp = '654321';
        await Otp.updateOne({ _id: record._id }, { $set: { otpHash: await bcrypt.hash(knownOtp, 10) } });

        const reset = await request(app).post('/api/auth/reset-password')
            .send({ email: alice.email, otp: knownOtp, password: 'NewStr0ngPass99' });

        expect(reset.status).toBe(200);

        const relogin = await request(app).post('/api/auth/login')
            .send({ email: alice.email, password: 'NewStr0ngPass99' });
        expect(relogin.status).toBe(200);

        const oldPasswordAttempt = await request(app).post('/api/auth/login')
            .send({ email: alice.email, password: 'Str0ngPass99' });
        expect(oldPasswordAttempt.status).toBe(400);

        expect(await Session.countDocuments({ userId: alice.id, isValid: true })).toBe(1); // only the relogin above
    });

    it('answers 200 for an unknown email without sending anything', async () => {
        const res = await request(app).post('/api/auth/forgot-password')
            .send({ email: 'nobody-here@example.com' });

        expect(res.status).toBe(200);
        expect(await Otp.countDocuments({ email: 'nobody-here@example.com' })).toBe(0);
    });
});

describe('top-up lifecycle', () => {
    const sign = (body) => crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');

    it('is visible in Activity as PENDING from the moment checkout starts', async () => {
        const alice = await signup('topup-pending@example.com');

        const order = await request(app).post('/api/payments/create-order')
            .set(auth(alice.token)).send({ amount: 500 });

        const history = await request(app).get('/api/transactions/history').set(auth(alice.token));

        expect(history.body.transactions).toHaveLength(1);
        expect(history.body.transactions[0].status).toBe('PENDING');
        expect(history.body.transactions[0].paymentRef).toBe(order.body.orderId);
        // A pending top-up must never have moved money.
        expect((await User.findById(alice.id)).accountBalance).toBe(0);
    });

    it('transitions the same row to SUCCESS on capture, rather than writing a second one', async () => {
        const alice = await signup('topup-capture@example.com');

        const order = await request(app).post('/api/payments/create-order')
            .set(auth(alice.token)).send({ amount: 500 });

        const body = JSON.stringify({
            event: 'payment.captured',
            payload: { payment: { entity: { id: 'pay_capture_1', order_id: order.body.orderId } } },
        });

        await request(app).post('/api/payments/webhook')
            .set('Content-Type', 'application/json')
            .set('x-razorpay-signature', sign(body))
            .send(body);

        expect(await Transaction.countDocuments({ category: 'Top Up' })).toBe(1);
        const tx = await Transaction.findOne({ category: 'Top Up' });
        expect(tx.status).toBe('SUCCESS');
        expect((await User.findById(alice.id)).accountBalance).toBe(500);
    });

    it('transitions the pending row to FAILED on payment.failed, without touching the balance', async () => {
        const alice = await signup('topup-failed@example.com');

        const order = await request(app).post('/api/payments/create-order')
            .set(auth(alice.token)).send({ amount: 500 });

        const body = JSON.stringify({
            event: 'payment.failed',
            payload: { payment: { entity: { id: 'pay_failed_1', order_id: order.body.orderId, error_description: 'Card declined' } } },
        });

        await request(app).post('/api/payments/webhook')
            .set('Content-Type', 'application/json')
            .set('x-razorpay-signature', sign(body))
            .send(body);

        const tx = await Transaction.findOne({ paymentRef: order.body.orderId });
        expect(tx.status).toBe('FAILED');
        expect(tx.failureReason).toBe('Card declined');
        expect((await User.findById(alice.id)).accountBalance).toBe(0);
    });
});

describe('idempotency middleware', () => {
    it('rejects a replayed key whose payload differs', async () => {
        const alice = await signup('idem-alice@example.com');
        const bob = await signup('idem-bob@example.com');
        await User.updateOne({ _id: alice.id }, { $set: { accountBalance: 1000, balanceMinor: 100000 } });

        const key = 'same-key-different-body';
        const first = await request(app).post('/api/transactions/transfer')
            .set(auth(alice.token))
            .send({ recipientId: bob.id, amount: 100, idempotencyKey: key });
        expect(first.status).toBe(200);

        const second = await request(app).post('/api/transactions/transfer')
            .set(auth(alice.token))
            .send({ recipientId: bob.id, amount: 200, idempotencyKey: key });

        expect(second.status).toBe(409);
        // Only the first transfer's ₹100 moved.
        expect((await User.findById(alice.id)).accountBalance).toBe(900);
    });
});
