import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import User from '../models/User.js';
import Session from '../models/Session.js';
import Transaction from '../models/Transaction.js';
import Payment from '../models/Payment.js';
import SupportTicket from '../models/SupportTicket.js';
import WebhookEvent from '../models/WebhookEvent.js';
import AuditLog, { AUDIT } from '../models/AuditLog.js';
import { generateInvoiceId } from '../utils/generateInvoiceId.js';

vi.mock('../utils/sendOtp.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../utils/fastapiClient.js', () => ({
    categorizeTransaction: vi.fn().mockResolvedValue({ category: 'Others', icon: 'CircleDollarSign', confidence_score: 0 }),
    checkFraud: vi.fn().mockResolvedValue({ risk_score: 0, risk_level: 'low', reason: 'test' }),
    default: {},
}));
vi.mock('../utils/socket.js', () => ({
    emitToUser: vi.fn(), getIO: vi.fn(), initSocket: vi.fn(), default: {},
}));
const fetchPayments = vi.fn();
vi.mock('../utils/razorpay.js', () => ({
    razorpayInstance: { orders: { fetchPayments: (...args) => fetchPayments(...args) } },
    verifyRazorpaySignature: vi.fn().mockReturnValue(true),
    verifyWebhookSignature: vi.fn().mockReturnValue(true),
}));

/**
 * The §28.2 console gaps closed on 2026-09-14, plus the two defects §0.15 listed
 * next to them (support priority order, the repair's missing ledger row) and
 * the §17.2 spending-rhythm grid.
 */
const { buildTestApp } = await import('./helpers/app.js');
const { reconcileBalances, repairAccountBalance } = await import('../services/reconciliationService.js');
const { applyAdjustment } = await import('../services/ledgerService.js');
const { listQueue } = await import('../services/supportService.js');

let app;
beforeAll(() => { app = buildTestApp(); });
beforeEach(() => fetchPayments.mockReset());

const PASSWORD = 'Str0ngPass99';
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const account = async (email, role) => {
    const res = await request(app).post('/api/auth/signup').send({ firstName: 'Test', email, password: PASSWORD });
    if (role) await User.updateOne({ _id: res.body.user._id }, { $set: { role, 'totp.enabled': true } });
    return { token: res.body.accessToken, id: res.body.user._id };
};
const settle = () => new Promise((r) => setTimeout(r, 60));
const row = (overrides) => Transaction.create({ invoiceId: generateInvoiceId(), description: 'seed', ...overrides });

describe('support queue priority order (plan.md §0.15)', () => {
    it('sorts urgent → high → normal → low, oldest first within a priority', async () => {
        const { id } = await account('prio@example.com');
        const make = (priority, n) => SupportTicket.create({
            userId: id, ticketNumber: `PP-${priority.slice(0, 3).toUpperCase()}${n}`, category: 'other',
            subject: `${priority} ${n}`, priority, messages: [{ author: 'user', body: 'hi' }],
        });
        await make('low', 1);
        await make('high', 1);
        await make('normal', 1);
        await make('urgent', 1);
        await make('high', 2);

        const { tickets } = await listQueue({ status: 'open' });
        expect(tickets.map((t) => t.subject)).toEqual(['urgent 1', 'high 1', 'high 2', 'normal 1', 'low 1']);
        expect(tickets[0].userId.email).toBe('prio@example.com');
        expect(tickets[0].messages).toBeUndefined();
    });
});

describe('repairAccountBalance writes a compensating ledger row', () => {
    it('records the correction as an adjustment note that does not re-open the drift', async () => {
        const { id } = await account('repair-row@example.com');
        const admin = await account('repair-row-admin@example.com', 'admin');
        await row({ userId: id, type: 'Credit', category: 'Top Up', amount: 250 });
        await User.updateOne({ _id: id }, { $set: { accountBalance: 1000, balanceMinor: 100000 } });

        const result = await repairAccountBalance(id, { reason: 'Test drift', actorId: admin.id });
        expect(result.repaired).toBe(true);

        const note = await Transaction.findById(result.transactionId).select('+adjustment.actorId').lean();
        expect(note).toMatchObject({
            source: 'adjustment', settlement: 'none', category: 'Adjustment', type: 'Debit', amount: 750,
        });
        expect(note.adjustment).toMatchObject({ kind: 'repair', reason: 'Test drift', previousBalance: 1000, correctedBalance: 250 });
        expect(String(note.adjustment.actorId)).toBe(admin.id);

        expect((await User.findById(id)).accountBalance).toBe(250);
        // The row must not count toward the sum it just corrected.
        expect(await reconcileBalances({ userId: id })).toEqual([]);
    });

    it('records an upward correction as a Credit note', async () => {
        const { id } = await account('repair-up@example.com');
        await row({ userId: id, type: 'Credit', category: 'Top Up', amount: 400 });
        await User.updateOne({ _id: id }, { $set: { accountBalance: 100, balanceMinor: 10000 } });

        const result = await repairAccountBalance(id);
        const note = await Transaction.findById(result.transactionId).lean();
        expect(note).toMatchObject({ type: 'Credit', amount: 300, settlement: 'none' });
    });
});

describe('ledgerService.applyAdjustment', () => {
    it('moves money as a settled adjustment row the reconciliation agrees with', async () => {
        const { id } = await account('adj-ledger@example.com');
        await applyAdjustment({ userId: id, amount: 120.5, type: 'Credit', reason: 'Goodwill credit' });
        await applyAdjustment({ userId: id, amount: 20.5, type: 'Debit', reason: 'Duplicate goodwill' });

        const user = await User.findById(id);
        expect(user.accountBalance).toBe(100);
        expect(user.balanceMinor).toBe(10000);
        const rows = await Transaction.find({ userId: id, source: 'adjustment' }).lean();
        expect(rows).toHaveLength(2);
        expect(rows.every((r) => r.settlement === 'settled' && r.adjustment.kind === 'manual')).toBe(true);
        expect(await reconcileBalances({ userId: id })).toEqual([]);
    });

    it('refuses a debit larger than the balance — an adjustment is not a second path below zero', async () => {
        const { id } = await account('adj-overdraw@example.com');
        await expect(applyAdjustment({ userId: id, amount: 10, type: 'Debit', reason: 'Too much' }))
            .rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
        expect((await User.findById(id)).accountBalance).toBe(0);
        expect(await Transaction.countDocuments({ userId: id })).toBe(0);
    });
});

describe('POST /api/admin/adjustments', () => {
    const body = (userId, extra = {}) => ({
        userId, type: 'Credit', amount: 50, reason: 'Compensation for failed top-up', currentPassword: PASSWORD, ...extra,
    });

    it('is admin-only', async () => {
        const risk = await account('adj-risk@example.com', 'risk');
        const support = await account('adj-support@example.com', 'support');
        const target = await account('adj-target1@example.com');
        expect((await request(app).post('/api/admin/adjustments').set(auth(risk.token)).send(body(target.id))).status).toBe(403);
        expect((await request(app).post('/api/admin/adjustments').set(auth(support.token)).send(body(target.id))).status).toBe(403);
    });

    it('requires re-authentication, a real reason, and never the actor’s own account', async () => {
        const admin = await account('adj-admin2@example.com', 'admin');
        const target = await account('adj-target2@example.com');
        const post = (b) => request(app).post('/api/admin/adjustments').set(auth(admin.token)).send(b);

        expect((await post(body(target.id, { currentPassword: 'wrong-password' }))).status).toBe(401);
        expect((await post(body(target.id, { reason: 'short' }))).status).toBe(400);
        expect((await post(body(target.id, { amount: -5 }))).status).toBe(400);
        expect((await post(body(admin.id))).status).toBe(403);
        expect((await User.findById(target.id)).accountBalance).toBe(0);
    });

    it('shows the customer the adjustment and its reason, but never which staff member made it', async () => {
        const admin = await account('adj-privacy-admin@example.com', 'admin');
        const target = await account('adj-privacy-target@example.com');
        await request(app).post('/api/admin/adjustments').set(auth(admin.token)).send(body(target.id));

        const mine = await request(app).get('/api/transactions/history').set(auth(target.token));
        const row = (mine.body.transactions ?? []).find((t) => t.source === 'adjustment');
        expect(row).toBeTruthy();
        expect(row.adjustment.reason).toBe('Compensation for failed top-up');
        expect(row.adjustment.actorId).toBeUndefined();
        expect(JSON.stringify(mine.body)).not.toContain(admin.id);

        const { emitToUser } = await import('../utils/socket.js');
        const pushed = emitToUser.mock.calls.filter(([id, event]) => id === target.id && event === 'wallet_update');
        expect(pushed.length).toBeGreaterThan(0);
        expect(JSON.stringify(pushed.at(-1)[2])).not.toContain(admin.id);

        const staffView = await request(app).get(`/api/admin/transactions/${row._id}`).set(auth(admin.token));
        expect(staffView.body.transaction.adjustment.actorId.email).toBe('adj-privacy-admin@example.com');
    });

    it('credits through the ledger, audits before/after, and replays an idempotent retry', async () => {
        const admin = await account('adj-admin3@example.com', 'admin');
        const target = await account('adj-target3@example.com');
        const send = () => request(app).post('/api/admin/adjustments')
            .set({ ...auth(admin.token), 'Idempotency-Key': 'adj-key-1' })
            .send(body(target.id));

        const first = await send();
        expect(first.status).toBe(201);
        expect(first.body.newBalance).toBe(50);
        const retry = await send();
        expect(retry.status).toBe(201);

        expect((await User.findById(target.id)).accountBalance).toBe(50);
        expect(await Transaction.countDocuments({ userId: target.id, source: 'adjustment' })).toBe(1);

        await settle();
        const entry = await AuditLog.findOne({ action: AUDIT.ADMIN_BALANCE_ADJUSTED }).lean();
        expect(entry.target.id).toBe(target.id);
        expect(entry.metadata).toMatchObject({ amount: 50, previousBalance: 0, correctedBalance: 50 });
        expect(JSON.stringify(entry)).not.toContain(PASSWORD);
    });
});

describe('GET /api/admin/users/:userId and POST .../logout-all', () => {
    it('returns an account summary to every staff role, and logs the read', async () => {
        const support = await account('detail-support@example.com', 'support');
        const user = await account('detail-user@example.com');
        await row({ userId: user.id, type: 'Credit', category: 'Top Up', amount: 10 });

        const res = await request(app).get(`/api/admin/users/${user.id}`).set(auth(support.token));
        expect(res.status).toBe(200);
        expect(res.body.user.email).toBe('detail-user@example.com');
        expect(res.body.user.password).toBeUndefined();
        expect(res.body.user.tokenVersion).toBeUndefined();
        expect(res.body.recentTransactions).toHaveLength(1);
        expect(res.body.activeSessions).toBeGreaterThanOrEqual(1);

        expect((await request(app).get(`/api/admin/users/${support.id}`).set(auth(user.token))).status).toBe(403);
        expect((await request(app).get('/api/admin/users/nope').set(auth(support.token))).status).toBe(400);

        await settle();
        expect(await AuditLog.findOne({ action: AUDIT.ADMIN_PII_ACCESSED, 'metadata.resource': 'user_detail' })).toBeTruthy();
    });

    it('revokes every session and kills live access tokens, with re-authentication', async () => {
        const risk = await account('logout-risk@example.com', 'risk');
        const support = await account('logout-support@example.com', 'support');
        const victim = await account('logout-victim@example.com');

        expect((await request(app).post(`/api/admin/users/${victim.id}/logout-all`).set(auth(support.token))
            .send({ currentPassword: PASSWORD })).status).toBe(403);
        expect((await request(app).post(`/api/admin/users/${victim.id}/logout-all`).set(auth(risk.token))
            .send({})).status).toBe(400);

        const res = await request(app).post(`/api/admin/users/${victim.id}/logout-all`).set(auth(risk.token))
            .send({ currentPassword: PASSWORD });
        expect(res.status).toBe(200);
        expect(await Session.countDocuments({ userId: victim.id })).toBe(0);

        const stale = await request(app).get('/api/users/profile').set(auth(victim.token));
        expect(stale.status).toBe(401);

        await settle();
        expect(await AuditLog.findOne({ action: AUDIT.ADMIN_FORCE_LOGOUT, 'target.id': victim.id })).toBeTruthy();
    });
});

describe('GET /api/admin/transactions', () => {
    it('searches across accounts by structured filters, for support too', async () => {
        const support = await account('txs-support@example.com', 'support');
        const a = await account('txs-a@example.com');
        const b = await account('txs-b@example.com');
        const target = await row({ userId: a.id, type: 'Debit', category: 'Food', amount: 75, status: 'SUCCESS', source: 'manual' });
        await row({ userId: a.id, type: 'Credit', category: 'Top Up', amount: 500, status: 'PENDING', source: 'topup' });
        await row({ userId: b.id, type: 'Debit', category: 'Food', amount: 900, source: 'p2p' });

        const get = (qs) => request(app).get(`/api/admin/transactions?${qs}`).set(auth(support.token));

        const byUser = await get(`userId=${a.id}`);
        expect(byUser.status).toBe(200);
        expect(byUser.body.total).toBe(2);

        expect((await get('status=PENDING')).body.transactions.map((t) => t.amount)).toEqual([500]);
        expect((await get('type=Debit&minAmount=50&maxAmount=100')).body.transactions.map((t) => t.amount)).toEqual([75]);

        const byInvoice = await get(`invoiceId=${target.invoiceId}`);
        expect(byInvoice.body.transactions).toHaveLength(1);
        expect(byInvoice.body.transactions[0].userId.email).toBe('txs-a@example.com');

        expect((await get('userId=bad')).status).toBe(400);
        // An operator filter object must not reach the query.
        expect((await request(app).get('/api/admin/transactions?status[$ne]=x').set(auth(support.token))).body.total).toBe(3);
    });

    it('returns a transfer with its other leg and linked payment', async () => {
        const admin = await account('txd-admin@example.com', 'admin');
        const a = await account('txd-a@example.com');
        const b = await account('txd-b@example.com');
        const debit = await row({ userId: a.id, type: 'Debit', category: 'Transfer', amount: 40, transferGroupId: 'grp-1' });
        await row({ userId: b.id, type: 'Credit', category: 'Transfer', amount: 40, transferGroupId: 'grp-1' });

        const res = await request(app).get(`/api/admin/transactions/${debit._id}`).set(auth(admin.token));
        expect(res.status).toBe(200);
        expect(res.body.otherLeg.userId.email).toBe('txd-b@example.com');
        expect(res.body.payment).toBeNull();
        expect((await request(app).get(`/api/admin/transactions/${a.id}`).set(auth(admin.token))).status).toBe(404);
    });
});

describe('payments: list and force re-settle', () => {
    it('flags stuck payments', async () => {
        const support = await account('pay-support@example.com', 'support');
        const u = await account('pay-u@example.com');
        await Payment.create({ userId: u.id, orderId: 'order_stuck_captured', amount: 10, status: 'captured', walletCredited: false });
        await Payment.create({ userId: u.id, orderId: 'order_fine', amount: 10, status: 'captured', walletCredited: true });
        const old = await Payment.create({ userId: u.id, orderId: 'order_stuck_created', amount: 10, status: 'created' });
        await Payment.collection.updateOne({ _id: old._id }, { $set: { createdAt: new Date(Date.now() - 60 * 60 * 1000) } });
        await Payment.create({ userId: u.id, orderId: 'order_fresh', amount: 10, status: 'created' });

        const res = await request(app).get('/api/admin/payments?stuck=true').set(auth(support.token));
        expect(res.status).toBe(200);
        expect(res.body.payments.map((p) => p.orderId).sort()).toEqual(['order_stuck_captured', 'order_stuck_created']);
    });

    it('credits an order only when the gateway reports it captured, and only once', async () => {
        const admin = await account('resettle-admin@example.com', 'admin');
        const support = await account('resettle-support@example.com', 'support');
        const u = await account('resettle-u@example.com');
        await Payment.create({ userId: u.id, orderId: 'order_lost', amount: 300, status: 'created' });
        await row({ userId: u.id, type: 'Credit', category: 'Top Up', amount: 300, status: 'PENDING', paymentRef: 'order_lost', source: 'topup' });

        expect((await request(app).post('/api/admin/payments/order_lost/resettle').set(auth(support.token))).status).toBe(403);

        fetchPayments.mockResolvedValueOnce({ items: [{ id: 'pay_x', status: 'failed' }] });
        const notCaptured = await request(app).post('/api/admin/payments/order_lost/resettle').set(auth(admin.token));
        expect(notCaptured.status).toBe(409);
        expect((await User.findById(u.id)).accountBalance).toBe(0);

        fetchPayments.mockResolvedValue({ items: [{ id: 'pay_x', status: 'failed' }, { id: 'pay_ok', status: 'captured' }] });
        const ok = await request(app).post('/api/admin/payments/order_lost/resettle').set(auth(admin.token));
        expect(ok.status).toBe(200);
        expect(ok.body.alreadySettled).toBe(false);

        const again = await request(app).post('/api/admin/payments/order_lost/resettle').set(auth(admin.token));
        expect(again.body.alreadySettled).toBe(true);

        expect((await User.findById(u.id)).accountBalance).toBe(300);
        expect(await Transaction.countDocuments({ userId: u.id, status: 'SUCCESS' })).toBe(1);
        expect(await reconcileBalances({ userId: u.id })).toEqual([]);
    });
});

describe('POST /api/admin/webhooks/:id/replay', () => {
    const capturedPayload = (orderId) => ({
        event: 'payment.captured',
        payload: { payment: { entity: { id: 'pay_replay', order_id: orderId } } },
    });

    it('re-runs a failed delivery, settling it exactly once', async () => {
        const admin = await account('replay-admin@example.com', 'admin');
        const u = await account('replay-u@example.com');
        await Payment.create({ userId: u.id, orderId: 'order_replay', amount: 120, status: 'created' });
        const stored = await WebhookEvent.create({
            eventId: 'hash-1', eventType: 'payment.captured', signatureValid: true,
            payload: capturedPayload('order_replay'), status: 'failed', error: 'db blip',
        });

        const res = await request(app).post(`/api/admin/webhooks/${stored._id}/replay`).set(auth(admin.token));
        expect(res.status).toBe(200);
        expect(res.body.outcome).toBe('processed');
        expect((await User.findById(u.id)).accountBalance).toBe(120);

        const after = await WebhookEvent.findById(stored._id).lean();
        expect(after.status).toBe('processed');
        expect(after.replayCount).toBe(1);

        const again = await request(app).post(`/api/admin/webhooks/${stored._id}/replay`).set(auth(admin.token));
        expect(again.status).toBe(409);
        expect((await User.findById(u.id)).accountBalance).toBe(120);

        await settle();
        expect(await AuditLog.findOne({ action: AUDIT.ADMIN_WEBHOOK_REPLAYED })).toBeTruthy();
    });

    it('refuses support, unsigned events and unknown ids', async () => {
        const admin = await account('replay-admin2@example.com', 'admin');
        const support = await account('replay-support@example.com', 'support');
        const unsigned = await WebhookEvent.create({
            eventId: 'hash-2', eventType: 'payment.captured', signatureValid: false, payload: capturedPayload('x'), status: 'failed',
        });

        expect((await request(app).post(`/api/admin/webhooks/${unsigned._id}/replay`).set(auth(support.token))).status).toBe(403);
        expect((await request(app).post(`/api/admin/webhooks/${unsigned._id}/replay`).set(auth(admin.token))).status).toBe(409);
        expect((await request(app).post(`/api/admin/webhooks/${admin.id}/replay`).set(auth(admin.token))).status).toBe(404);
    });
});

describe('GET /api/analytics/spending-rhythm', () => {
    it('returns a dense Monday-first 7×24 grid in IST, counting settled spending only', async () => {
        const u = await account('rhythm@example.com');
        // A recent Monday, 09:30 IST = 04:00 UTC.
        const monday = new Date();
        monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7) - 7);
        monday.setUTCHours(4, 0, 0, 0);

        await row({ userId: u.id, type: 'Debit', category: 'Food', amount: 100, postedAt: monday });
        await row({ userId: u.id, type: 'Debit', category: 'Food', amount: 50, postedAt: monday });
        await row({ userId: u.id, type: 'Debit', category: 'Food', amount: 999, postedAt: monday, settlement: 'none' });
        await row({ userId: u.id, type: 'Debit', category: 'Refund', amount: 999, postedAt: monday });
        await row({ userId: u.id, type: 'Debit', category: 'Food', amount: 999, postedAt: monday, status: 'FAILED' });
        await row({ userId: u.id, type: 'Credit', category: 'Top Up', amount: 999, postedAt: monday });

        const res = await request(app).get('/api/analytics/spending-rhythm?range=1M').set(auth(u.token));
        expect(res.status).toBe(200);
        expect(res.body.amounts).toHaveLength(7);
        expect(res.body.amounts.every((d) => d.length === 24)).toBe(true);
        expect(res.body.days[0]).toBe('Mon');
        expect(res.body.amounts[0][9]).toBe(150);
        expect(res.body.counts[0][9]).toBe(2);
        expect(res.body.totalAmount).toBe(150);
        expect(res.body.peak).toMatchObject({ day: 0, hour: 9, amount: 150 });
        expect(res.body.byHour[9]).toBe(150);
    });

    it('returns an empty grid with no peak for an account with no spending', async () => {
        const u = await account('rhythm-empty@example.com');
        const res = await request(app).get('/api/analytics/spending-rhythm?range=bogus').set(auth(u.token));
        expect(res.status).toBe(200);
        expect(res.body.range).toBe('3M');
        expect(res.body.peak).toBeNull();
        expect(res.body.transactionCount).toBe(0);
    });
});
