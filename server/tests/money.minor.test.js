import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import { toPaise, fromPaise } from '../utils/money.js';

vi.mock('../utils/sendOtp.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../utils/fastapiClient.js', () => ({
    categorizeTransaction: vi.fn().mockResolvedValue({ category: 'Others', icon: 'CircleDollarSign', confidence_score: 0 }),
    checkFraud: vi.fn().mockResolvedValue({ risk_score: 0, risk_level: 'low', reason: 'test' }),
    default: {},
}));
vi.mock('../utils/socket.js', () => ({
    emitToUser: vi.fn(), getIO: vi.fn(), initSocket: vi.fn(), default: {},
}));

const WEBHOOK_SECRET = 'test_webhook_secret_minor';
process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;

/**
 * Dynamic and deliberately after the env assignment above — see phase1.test.js
 * for why: config/env.js snapshots process.env once, on first import, and a
 * static import here would be hoisted ahead of the line above.
 */
const { buildTestApp } = await import('./helpers/app.js');

let app;
beforeAll(() => { app = buildTestApp(); });

const signup = async (email) => {
    const res = await request(app).post('/api/auth/signup')
        .send({ firstName: email.split('@')[0], email, password: 'Str0ngPass99' });
    return { token: res.body.accessToken, id: res.body.user._id };
};
const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe('utils/money: toPaise / fromPaise', () => {
    it('round-trips a clean two-decimal amount exactly', () => {
        expect(toPaise(199.5)).toBe(19950);
        expect(fromPaise(19950)).toBe(199.5);
    });

    it('rounds a value that would otherwise drift under floating point', () => {
        // 0.1 + 0.2 style drift: toMoney/toPaise must not leak IEEE-754 noise
        // into a value that is supposed to be an exact integer paise count.
        expect(toPaise(19.99)).toBe(1999);
        expect(toPaise(0.1 + 0.2)).toBe(30);
    });

    it('round-trips zero', () => {
        expect(toPaise(0)).toBe(0);
        expect(fromPaise(0)).toBe(0);
    });
});

describe('ledgerService writes amountMinor/balanceMinor in lockstep with the rupee fields', () => {
    it('on a manual transaction', async () => {
        const alice = await signup('minor-manual@example.com');

        const res = await request(app).post('/api/transactions/add')
            .set(auth(alice.token))
            .send({ description: 'Cash lunch', amount: 250.5, type: 'expense' });

        const tx = await Transaction.findById(res.body.transaction._id);
        expect(tx.amountMinor).toBe(25050);
    });

    it('on a P2P transfer, for both legs and both balances', async () => {
        const alice = await signup('minor-sender@example.com');
        const bob = await signup('minor-recipient@example.com');
        await User.updateOne({ _id: alice.id }, { $set: { accountBalance: 1000, balanceMinor: 100000 } });

        const res = await request(app).post('/api/transactions/transfer')
            .set(auth(alice.token))
            .send({ recipientId: bob.id, amount: 300 });

        expect(res.status).toBe(200);

        const senderTx = await Transaction.findById(res.body.senderTransactionId);
        const recipientTx = await Transaction.findById(res.body.recipientTransactionId);
        expect(senderTx.amountMinor).toBe(30000);
        expect(recipientTx.amountMinor).toBe(30000);

        const senderUser = await User.findById(alice.id);
        const recipientUser = await User.findById(bob.id);
        expect(senderUser.balanceMinor).toBe(70000);
        expect(senderUser.balanceMinor).toBe(toPaise(senderUser.accountBalance));
        expect(recipientUser.balanceMinor).toBe(toPaise(recipientUser.accountBalance));
    });

    it('on a captured top-up, once the pending row transitions to SUCCESS', async () => {
        const alice = await signup('minor-topup@example.com');
        const order = await request(app).post('/api/payments/create-order')
            .set(auth(alice.token)).send({ amount: 500 });

        const body = JSON.stringify({
            event: 'payment.captured',
            payload: { payment: { entity: { id: 'pay_minor_1', order_id: order.body.orderId } } },
        });
        const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');

        await request(app).post('/api/payments/webhook')
            .set('Content-Type', 'application/json')
            .set('x-razorpay-signature', signature)
            .send(body);

        const tx = await Transaction.findOne({ paymentRef: order.body.orderId });
        expect(tx.amountMinor).toBe(50000);
        expect((await User.findById(alice.id)).balanceMinor).toBe(50000);
    });
});
