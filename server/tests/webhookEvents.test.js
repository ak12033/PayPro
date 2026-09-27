import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import User from '../models/User.js';
import WebhookEvent from '../models/WebhookEvent.js';

vi.mock('../utils/sendOtp.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../utils/fastapiClient.js', () => ({
    categorizeTransaction: vi.fn().mockResolvedValue({ category: 'Others', icon: 'CircleDollarSign', confidence_score: 0 }),
    checkFraud: vi.fn().mockResolvedValue({ risk_score: 0, risk_level: 'low', reason: 'test' }),
    default: {},
}));
vi.mock('../utils/socket.js', () => ({
    emitToUser: vi.fn(), getIO: vi.fn(), initSocket: vi.fn(), default: {},
}));

const WEBHOOK_SECRET = 'test_webhook_secret_events';
process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;

const { buildTestApp } = await import('./helpers/app.js');

let app;
beforeAll(() => { app = buildTestApp(); });

const signup = async (email) => {
    const res = await request(app).post('/api/auth/signup')
        .send({ firstName: email.split('@')[0], email, password: 'Str0ngPass99' });
    return { token: res.body.accessToken, id: res.body.user._id, email };
};
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const sign = (body) => crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');

describe('webhook event store', () => {
    it('records every accepted delivery', async () => {
        const alice = await signup('webhook-record@example.com');
        const order = await request(app).post('/api/payments/create-order')
            .set(auth(alice.token)).send({ amount: 200 });

        const body = JSON.stringify({
            event: 'payment.captured',
            payload: { payment: { entity: { id: 'pay_wh_1', order_id: order.body.orderId } } },
        });

        const res = await request(app).post('/api/payments/webhook')
            .set('Content-Type', 'application/json')
            .set('x-razorpay-signature', sign(body))
            .send(body);

        expect(res.status).toBe(200);
        expect(await WebhookEvent.countDocuments({ eventType: 'payment.captured' })).toBe(1);
        const stored = await WebhookEvent.findOne({ eventType: 'payment.captured' });
        expect(stored.status).toBe('processed');
        expect(stored.signatureValid).toBe(true);
    });

    it('deduplicates an identical redelivery instead of processing it twice', async () => {
        const alice = await signup('webhook-dedupe@example.com');
        const order = await request(app).post('/api/payments/create-order')
            .set(auth(alice.token)).send({ amount: 300 });

        const body = JSON.stringify({
            event: 'payment.captured',
            payload: { payment: { entity: { id: 'pay_wh_2', order_id: order.body.orderId } } },
        });
        const signature = sign(body);

        const first = await request(app).post('/api/payments/webhook')
            .set('Content-Type', 'application/json').set('x-razorpay-signature', signature).send(body);
        const second = await request(app).post('/api/payments/webhook')
            .set('Content-Type', 'application/json').set('x-razorpay-signature', signature).send(body);

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(second.body.status).toBe('duplicate');

        // Only credited once, despite two identical deliveries.
        expect((await User.findById(alice.id)).accountBalance).toBe(300);
        expect(await WebhookEvent.countDocuments({})).toBe(1);
    });

    it('two different events for the same order are recorded as two rows, not deduplicated against each other', async () => {
        const alice = await signup('webhook-distinct@example.com');
        const order = await request(app).post('/api/payments/create-order')
            .set(auth(alice.token)).send({ amount: 400 });

        const captured = JSON.stringify({
            event: 'payment.captured',
            payload: { payment: { entity: { id: 'pay_wh_3', order_id: order.body.orderId } } },
        });
        await request(app).post('/api/payments/webhook')
            .set('Content-Type', 'application/json').set('x-razorpay-signature', sign(captured)).send(captured);

        const refunded = JSON.stringify({
            event: 'refund.processed',
            payload: { refund: { entity: { id: 'rfnd_wh_3', payment_id: 'pay_wh_3', amount: 40000 } } },
        });
        await request(app).post('/api/payments/webhook')
            .set('Content-Type', 'application/json').set('x-razorpay-signature', sign(refunded)).send(refunded);

        expect(await WebhookEvent.countDocuments({})).toBe(2);
    });

    it('marks an unrecognised payload shape as ignored rather than failed', async () => {
        const body = JSON.stringify({ event: 'some.other.event', payload: {} });

        const res = await request(app).post('/api/payments/webhook')
            .set('Content-Type', 'application/json')
            .set('x-razorpay-signature', sign(body))
            .send(body);

        expect(res.status).toBe(200);
        const stored = await WebhookEvent.findOne({ eventType: 'some.other.event' });
        expect(stored.status).toBe('ignored');
    });

    it('never records a delivery with a bad signature at all', async () => {
        const body = JSON.stringify({ event: 'payment.captured', payload: {} });

        const res = await request(app).post('/api/payments/webhook')
            .set('Content-Type', 'application/json')
            .set('x-razorpay-signature', 'not-the-real-signature')
            .send(body);

        expect(res.status).toBe(400);
        expect(await WebhookEvent.countDocuments({})).toBe(0);
    });
});
