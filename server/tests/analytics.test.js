import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import Transaction from '../models/Transaction.js';
import Payment from '../models/Payment.js';
import { generateInvoiceId } from '../utils/generateInvoiceId.js';

const { buildTestApp } = await import('./helpers/app.js');

let app;
beforeAll(() => { app = buildTestApp(); });

const signup = async (email, password = 'Str0ngPass99') => {
    const res = await request(app).post('/api/auth/signup')
        .send({ firstName: email.split('@')[0], email, password });
    return { token: res.body.accessToken, id: res.body.user._id };
};

const auth = (t) => ({ Authorization: `Bearer ${t}` });

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

/** Creates a Transaction, then force-sets `createdAt` so fixtures can land in a specific bucket regardless of the timestamps plugin. */
const seedTransaction = async (overrides) => {
    const doc = await Transaction.create({
        invoiceId: generateInvoiceId(),
        description: 'seed',
        ...overrides,
    });
    if (overrides.createdAt) {
        await Transaction.updateOne({ _id: doc._id }, { $set: { createdAt: overrides.createdAt } });
    }
    return doc;
};

const seedPayment = async (overrides) => {
    const doc = await Payment.create({
        orderId: `order_${generateInvoiceId()}`,
        amount: 100,
        ...overrides,
    });
    if (overrides.createdAt) {
        await Payment.updateOne({ _id: doc._id }, { $set: { createdAt: overrides.createdAt } });
    }
    return doc;
};

describe('GET /api/analytics/overview', () => {
    it('aggregates money in/out, net cash flow and transaction count from real ledger rows', async () => {
        const alice = await signup('alice-overview@example.com');
        const bob = await signup('bob-overview@example.com');

        await seedTransaction({ userId: alice.id, type: 'Credit', category: 'Top Up', amount: 500, createdAt: daysAgo(1) });
        await seedTransaction({ userId: alice.id, type: 'Credit', category: 'Top Up', amount: 300, createdAt: daysAgo(2) });
        await seedTransaction({ userId: alice.id, type: 'Credit', category: 'Transfer', amount: 200, recipientId: bob.id, createdAt: daysAgo(3) });
        await seedTransaction({ userId: alice.id, type: 'Debit', category: 'Food', amount: 100, createdAt: daysAgo(1) });
        await seedTransaction({ userId: alice.id, type: 'Debit', category: 'Food', amount: 50, createdAt: daysAgo(2) });
        await seedTransaction({ userId: alice.id, type: 'Debit', category: 'Transfer', amount: 120, recipientId: bob.id, createdAt: daysAgo(4) });

        // Outside the current 30-day window: must not be counted in the summary.
        await seedTransaction({ userId: alice.id, type: 'Debit', category: 'Food', amount: 9999, createdAt: daysAgo(45) });

        const res = await request(app).get('/api/analytics/overview?range=1M').set(auth(alice.token));

        expect(res.status).toBe(200);
        expect(res.body.summary).toMatchObject({
            moneyIn: 1000,
            moneyOut: 270,
            netCashFlow: 730,
            transactionCount: 6,
        });
        expect(Array.isArray(res.body.series)).toBe(true);
        expect(res.body.series.length).toBeGreaterThan(0);
    });

    it('never leaks one user\'s numbers into another user\'s summary', async () => {
        const alice = await signup('alice-isolation@example.com');
        const bob = await signup('bob-isolation@example.com');

        await seedTransaction({ userId: alice.id, type: 'Credit', category: 'Top Up', amount: 5000, createdAt: daysAgo(1) });

        const res = await request(app).get('/api/analytics/overview?range=1M').set(auth(bob.token));

        expect(res.status).toBe(200);
        expect(res.body.summary).toMatchObject({ moneyIn: 0, moneyOut: 0, transactionCount: 0 });
    });

    it('falls back to the default range instead of erroring on a bogus value', async () => {
        const alice = await signup('alice-badrange@example.com');

        const res = await request(app).get('/api/analytics/overview?range=not-a-real-range').set(auth(alice.token));

        expect(res.status).toBe(200);
        expect(res.body.summary).toHaveProperty('netCashFlow');
    });

    it('requires authentication', async () => {
        const res = await request(app).get('/api/analytics/overview?range=1M');
        expect(res.status).toBe(401);
    });
});

describe('GET /api/analytics/categories', () => {
    it('ranks Debit categories by amount for the current period', async () => {
        const alice = await signup('alice-categories@example.com');

        await seedTransaction({ userId: alice.id, type: 'Debit', category: 'Food', amount: 150, createdAt: daysAgo(1) });
        await seedTransaction({ userId: alice.id, type: 'Debit', category: 'Transport', amount: 50, createdAt: daysAgo(2) });
        // Credit rows are not spend and must be excluded.
        await seedTransaction({ userId: alice.id, type: 'Credit', category: 'Top Up', amount: 1000, createdAt: daysAgo(1) });

        const res = await request(app).get('/api/analytics/categories?range=1M').set(auth(alice.token));

        expect(res.status).toBe(200);
        expect(res.body.totalAmount).toBe(200);
        expect(res.body.items[0]).toMatchObject({ category: 'Food', amount: 150, percent: 75 });
        expect(res.body.items[1]).toMatchObject({ category: 'Transport', amount: 50, percent: 25 });
    });
});

describe('GET /api/analytics/network', () => {
    it('counts distinct transfer recipients and ranks them by amount sent', async () => {
        const alice = await signup('alice-network@example.com');
        const bob = await signup('bob-network@example.com');

        await seedTransaction({ userId: alice.id, type: 'Debit', category: 'Transfer', amount: 120, recipientId: bob.id, createdAt: daysAgo(1) });
        await seedTransaction({ userId: alice.id, type: 'Debit', category: 'Transfer', amount: 80, recipientId: bob.id, createdAt: daysAgo(2) });

        const res = await request(app).get('/api/analytics/network?range=1M').set(auth(alice.token));

        expect(res.status).toBe(200);
        expect(res.body.totalNetwork).toBe(1);
        expect(res.body.topRecipients[0]).toMatchObject({ totalSent: 200, count: 2 });
    });
});

describe('GET /api/analytics/payments-status', () => {
    it('summarises settlement outcomes and computes the success rate from real Payment rows', async () => {
        const alice = await signup('alice-payments@example.com');

        await seedPayment({ userId: alice.id, status: 'captured', amount: 100, createdAt: daysAgo(1) });
        await seedPayment({ userId: alice.id, status: 'captured', amount: 100, createdAt: daysAgo(1) });
        await seedPayment({ userId: alice.id, status: 'failed', amount: 100, createdAt: daysAgo(1) });
        await seedPayment({ userId: alice.id, status: 'created', amount: 100, createdAt: daysAgo(1) });
        await seedPayment({ userId: alice.id, status: 'refunded', amount: 100, createdAt: daysAgo(1) });

        const res = await request(app).get('/api/analytics/payments-status?range=1M').set(auth(alice.token));

        expect(res.status).toBe(200);
        expect(res.body.summary).toMatchObject({
            captured: 2,
            failed: 1,
            pending: 1,
            refunded: 1,
            successRate: 66.67,
        });
        // No payments in the previous period: nothing to compare against.
        expect(res.body.summary.successRateChangePct).toBeNull();
    });
});
