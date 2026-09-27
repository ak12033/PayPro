import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import BankAccount from '../models/BankAccount.js';
import WithdrawalRequest from '../models/WithdrawalRequest.js';
import AuditLog, { AUDIT } from '../models/AuditLog.js';
import { PASSWORD, auth, makeAccount, verifyKyc, settle } from './helpers/phase5.js';

vi.mock('../utils/sendOtp.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../utils/fastapiClient.js', () => ({
    categorizeTransaction: vi.fn().mockResolvedValue({ category: 'Others', icon: 'CircleDollarSign', confidence_score: 0 }),
    checkFraud: vi.fn().mockResolvedValue({ risk_score: 0, risk_level: 'low', reason: 'test' }),
    default: {},
}));
vi.mock('../utils/socket.js', () => ({ emitToUser: vi.fn(), getIO: vi.fn(), initSocket: vi.fn(), default: {} }));

/**
 * Phase 5 withdrawals (plan.md §0.20.3): bank accounts verified by an admin,
 * money held on the ledger from request to payout, paid by an operator's bank
 * transfer and recorded with its UTR. The reconciliation assertions are the
 * point: the balance must equal the ledger at *every* step, including while
 * money is held and after it is returned.
 */
const { buildTestApp } = await import('./helpers/app.js');
const { reconcileBalances } = await import('../services/reconciliationService.js');

let app;
beforeAll(() => { app = buildTestApp(); });

const ACCOUNT = { holderName: 'Asha Rani Verma', accountNumber: '123456789012', confirmAccountNumber: '123456789012', ifsc: 'HDFC0001234', bankName: 'HDFC Bank' };

/** A holder with ₹`balance` of real ledger history, VERIFIED KYC and a verified bank account. */
const readyHolder = async (prefix, { balance = 5000 } = {}) => {
    const user = await makeAccount(app, `${prefix}@example.com`);
    const admin = await makeAccount(app, `${prefix}-admin@example.com`, { role: 'admin' });
    // A real ledger row behind the balance, so reconciliation starts clean.
    const { creditFromPayment } = await import('../services/ledgerService.js');
    await creditFromPayment({ userId: user.id, amount: balance, description: 'Seed top-up', paymentRef: `seed-${prefix}` });
    await verifyKyc(app, user, admin);
    const added = await request(app).post('/api/withdrawals/bank-accounts').set(auth(user.token)).send(ACCOUNT).expect(201);
    await request(app).post(`/api/admin/bank-accounts/${added.body.account._id}/decision`).set(auth(admin.token))
        .send({ decision: 'verified', notes: 'Cancelled cheque matches KYC name', currentPassword: PASSWORD }).expect(200);
    return { user, admin, bankAccountId: added.body.account._id };
};

const withdraw = (user, bankAccountId, amount, key) => {
    const req = request(app).post('/api/withdrawals').set(auth(user.token));
    if (key) req.set('Idempotency-Key', key);
    return req.send({ bankAccountId, amount });
};
const balanceOf = async (id) => (await User.findById(id).lean()).balanceMinor;
const clean = async (id) => expect(await reconcileBalances({ userId: id })).toEqual([]);

describe('bank accounts', () => {
    it('stores the number encrypted, shows it masked, and tells the holder an account was added', async () => {
        const user = await makeAccount(app, 'bank-add@example.com');
        const res = await request(app).post('/api/withdrawals/bank-accounts').set(auth(user.token)).send(ACCOUNT);
        expect(res.status).toBe(201);
        expect(res.body.account).toMatchObject({ accountNumberMasked: 'XXXXXXXX9012', status: 'pending', ifsc: 'HDFC0001234' });
        expect(JSON.stringify(res.body)).not.toContain('123456789012');

        const stored = await BankAccount.findById(res.body.account._id).select('+accountNumberEncrypted').lean();
        expect(stored.accountNumberEncrypted).toMatch(/^v1:/);

        const dup = await request(app).post('/api/withdrawals/bank-accounts').set(auth(user.token)).send(ACCOUNT);
        expect(dup.body.code).toBe('DUPLICATE_ACCOUNT');
    });

    it.each([
        ['a bad IFSC', { ifsc: 'HDFC1234' }, 'INVALID_IFSC'],
        ['a short account number', { accountNumber: '1234', confirmAccountNumber: '1234' }, 'INVALID_ACCOUNT_NUMBER'],
        ['mismatched confirmation', { confirmAccountNumber: '123456789013' }, 'ACCOUNT_NUMBER_MISMATCH'],
    ])('refuses %s', async (_label, overrides, code) => {
        const user = await makeAccount(app, `bank-bad-${code.toLowerCase()}@example.com`);
        const res = await request(app).post('/api/withdrawals/bank-accounts').set(auth(user.token)).send({ ...ACCOUNT, ...overrides });
        expect(res.body.code).toBe(code);
    });

    it('cannot be verified before the holder\'s identity is', async () => {
        const user = await makeAccount(app, 'bank-nokyc@example.com');
        const admin = await makeAccount(app, 'bank-nokyc-admin@example.com', { role: 'admin' });
        const added = await request(app).post('/api/withdrawals/bank-accounts').set(auth(user.token)).send(ACCOUNT);
        const res = await request(app).post(`/api/admin/bank-accounts/${added.body.account._id}/decision`).set(auth(admin.token))
            .send({ decision: 'verified', notes: 'Looks right to me', currentPassword: PASSWORD });
        expect(res.body.code).toBe('KYC_NOT_VERIFIED');
    });

    it('flags the same account on two customers as a shared identifier', async () => {
        const a = await makeAccount(app, 'bank-share-a@example.com');
        const b = await makeAccount(app, 'bank-share-b@example.com');
        await request(app).post('/api/withdrawals/bank-accounts').set(auth(a.token)).send(ACCOUNT).expect(201);
        await request(app).post('/api/withdrawals/bank-accounts').set(auth(b.token)).send(ACCOUNT).expect(201);
        await settle();
        const { default: AmlAlert } = await import('../models/AmlAlert.js');
        expect(await AmlAlert.countDocuments({ userId: b.id, rule: 'SHARED_IDENTIFIER' })).toBe(1);
    });

    it('audits every reveal of the full account number', async () => {
        const { admin, bankAccountId } = await readyHolder('bank-reveal');
        const res = await request(app).get(`/api/admin/bank-accounts/${bankAccountId}/account-number`).set(auth(admin.token));
        expect(res.body.accountNumber).toBe('123456789012');
        expect(res.headers['cache-control']).toContain('no-store');
        await settle();
        expect(await AuditLog.countDocuments({ action: AUDIT.BANK_ACCOUNT_REVEALED, userId: admin.id })).toBe(1);
    });
});

describe('requesting a withdrawal', () => {
    it('needs verified identity and a verified account', async () => {
        const user = await makeAccount(app, 'wd-gates@example.com', { balance: 1000 });
        const res = await withdraw(user, '0123456789abcdef01234567', 500);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('KYC_REQUIRED');
    });

    it('holds the money on the ledger at once, and the balance still reconciles', async () => {
        const { user, bankAccountId } = await readyHolder('wd-hold');
        const res = await withdraw(user, bankAccountId, 1200);
        expect(res.status).toBe(201);
        expect(res.body.withdrawal).toMatchObject({ status: 'requested', amount: 1200 });
        expect(await balanceOf(user.id)).toBe(380000);

        const row = await Transaction.findById(res.body.withdrawal.transactionId).lean();
        expect(row).toMatchObject({ source: 'withdrawal', category: 'Withdrawal', status: 'PENDING', settlement: 'settled', type: 'Debit' });
        await clean(user.id);
    });

    it('refuses more than the balance, below the minimum, and a replay does not hold twice', async () => {
        const { user, bankAccountId } = await readyHolder('wd-bounds', { balance: 1000 });
        expect((await withdraw(user, bankAccountId, 5000)).body.code).toBe('INSUFFICIENT_FUNDS');
        expect((await withdraw(user, bankAccountId, 50)).body.code).toBe('BELOW_MINIMUM');

        const first = await withdraw(user, bankAccountId, 400, 'wd-key-1');
        const replay = await withdraw(user, bankAccountId, 400, 'wd-key-1');
        expect(first.status).toBe(201);
        expect(replay.status).toBe(201);
        expect(await WithdrawalRequest.countDocuments({ userId: user.id })).toBe(1);
        expect(await balanceOf(user.id)).toBe(60000);
    });

    it('counts held withdrawals against the daily limit', async () => {
        const { user, bankAccountId } = await readyHolder('wd-limit', { balance: 100000 });
        // basic tier: ₹2,00,000 a day — seed ₹1,99,000 of transfers already today.
        await User.updateOne({ _id: user.id }, { $set: { accountBalance: 300000, balanceMinor: 30000000 } });
        await Transaction.create({ userId: user.id, invoiceId: 'INV-LIMIT-SEED', description: 'seed', amount: 199000, amountMinor: 19900000, type: 'Debit', category: 'Transfer', source: 'p2p' });
        const res = await withdraw(user, bankAccountId, 2000);
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/withdrawal would exceed your daily limit/);
    });
});

describe('the operator path', () => {
    it('approve → paid moves the row PENDING → PROCESSING → SUCCESS with the UTR, reconciling at every step', async () => {
        const { user, admin, bankAccountId } = await readyHolder('wd-paid');
        const { body } = await withdraw(user, bankAccountId, 1000);
        const id = body.withdrawal._id;
        const rowStatus = async () => (await Transaction.findById(body.withdrawal.transactionId).lean()).status;

        expect((await request(app).post(`/api/admin/withdrawals/${id}/approve`).set(auth(admin.token)).send({})).status).toBe(400);
        await request(app).post(`/api/admin/withdrawals/${id}/approve`).set(auth(admin.token)).send({ currentPassword: PASSWORD }).expect(200);
        expect(await rowStatus()).toBe('PROCESSING');
        await clean(user.id);

        const dest = await request(app).get(`/api/admin/withdrawals/${id}/destination`).set(auth(admin.token)).expect(200);
        expect(dest.body.accountNumber).toBe('123456789012');

        expect((await request(app).post(`/api/admin/withdrawals/${id}/paid`).set(auth(admin.token)).send({ reference: 'x', currentPassword: PASSWORD })).body.code).toBe('REFERENCE_REQUIRED');
        await request(app).post(`/api/admin/withdrawals/${id}/paid`).set(auth(admin.token)).send({ reference: 'hdfcn52026092712345', currentPassword: PASSWORD }).expect(200);
        expect(await rowStatus()).toBe('SUCCESS');
        expect(await balanceOf(user.id)).toBe(400000);
        await clean(user.id);

        const mine = await request(app).get('/api/withdrawals').set(auth(user.token)).expect(200);
        expect(mine.body.withdrawals[0]).toMatchObject({ status: 'paid', payoutReference: 'HDFCN52026092712345' });

        // Paid is final: it cannot be failed afterwards, and the UTR cannot be reused.
        const late = await request(app).post(`/api/admin/withdrawals/${id}/fail`).set(auth(admin.token)).send({ userVisibleReason: 'Bank returned it', currentPassword: PASSWORD });
        expect(late.status).toBe(409);
    });

    it('reject returns the held money once; the row leaves the balance sum as the money returns', async () => {
        const { user, admin, bankAccountId } = await readyHolder('wd-reject');
        const { body } = await withdraw(user, bankAccountId, 1500);
        const reject = () => request(app).post(`/api/admin/withdrawals/${body.withdrawal._id}/reject`).set(auth(admin.token))
            .send({ userVisibleReason: 'The destination account is closed.' });

        const results = await Promise.all([reject(), reject()]);
        expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
        expect(await balanceOf(user.id)).toBe(500000);
        expect((await Transaction.findById(body.withdrawal.transactionId).lean()).status).toBe('CANCELLED');
        await clean(user.id);
    });

    it('a failed bank transfer returns the money from PROCESSING', async () => {
        const { user, admin, bankAccountId } = await readyHolder('wd-fail');
        const { body } = await withdraw(user, bankAccountId, 700);
        await request(app).post(`/api/admin/withdrawals/${body.withdrawal._id}/approve`).set(auth(admin.token)).send({ currentPassword: PASSWORD }).expect(200);
        await request(app).post(`/api/admin/withdrawals/${body.withdrawal._id}/fail`).set(auth(admin.token))
            .send({ userVisibleReason: 'Your bank returned the transfer.', currentPassword: PASSWORD }).expect(200);
        expect(await balanceOf(user.id)).toBe(500000);
        expect((await Transaction.findById(body.withdrawal.transactionId).lean()).status).toBe('FAILED');
        await clean(user.id);
    });

    it('a holder cancelling while an admin rejects returns the money exactly once', async () => {
        const { user, admin, bankAccountId } = await readyHolder('wd-race');
        const { body } = await withdraw(user, bankAccountId, 900);
        const id = body.withdrawal._id;
        const results = await Promise.all([
            request(app).post(`/api/withdrawals/${id}/cancel`).set(auth(user.token)),
            request(app).post(`/api/admin/withdrawals/${id}/reject`).set(auth(admin.token)).send({ userVisibleReason: 'Duplicate request.' }),
        ]);
        expect(results.filter((r) => r.status === 200)).toHaveLength(1);
        expect(await balanceOf(user.id)).toBe(500000);
        await clean(user.id);
    });

    it('re-checks identity at approval: a revoked KYC stops the payout', async () => {
        const { user, admin, bankAccountId } = await readyHolder('wd-revoked');
        const { body } = await withdraw(user, bankAccountId, 600);
        const { default: KycSubmission } = await import('../models/KycSubmission.js');
        const sub = await KycSubmission.findOne({ userId: user.id }).lean();
        await request(app).post(`/api/admin/kyc/${sub._id}/revoke`).set(auth(admin.token)).send({
            notes: 'Identity document reported stolen', userVisibleReason: 'Please verify again.', requestedActions: ['Upload your PAN again'], currentPassword: PASSWORD,
        }).expect(200);
        const res = await request(app).post(`/api/admin/withdrawals/${body.withdrawal._id}/approve`).set(auth(admin.token)).send({ currentPassword: PASSWORD });
        expect(res.body.code).toBe('KYC_NOT_VERIFIED');
    });

    it('staff cannot process their own withdrawal', async () => {
        const { user, admin, bankAccountId } = await readyHolder('wd-self');
        await User.updateOne({ _id: user.id }, { $set: { role: 'admin', 'totp.enabled': true } });
        const { body } = await withdraw(user, bankAccountId, 300);
        const res = await request(app).post(`/api/admin/withdrawals/${body.withdrawal._id}/approve`).set(auth(user.token)).send({ currentPassword: PASSWORD });
        expect(res.body.code).toBe('SELF_REVIEW');
        await request(app).post(`/api/admin/withdrawals/${body.withdrawal._id}/approve`).set(auth(admin.token)).send({ currentPassword: PASSWORD }).expect(200);
    });

    it('account closure waits for an open withdrawal', async () => {
        const { user, bankAccountId } = await readyHolder('wd-close');
        await withdraw(user, bankAccountId, 300);
        const res = await request(app).post('/api/users/me/close').set(auth(user.token)).send({ currentPassword: PASSWORD });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('WITHDRAWAL_OPEN');
    });
});

describe('statement matching', () => {
    it('matches paid withdrawals by UTR and amount, and reports the rest', async () => {
        const { user, admin, bankAccountId } = await readyHolder('wd-statement');
        const pay = async (amount, reference) => {
            const { body } = await withdraw(user, bankAccountId, amount);
            await request(app).post(`/api/admin/withdrawals/${body.withdrawal._id}/approve`).set(auth(admin.token)).send({ currentPassword: PASSWORD }).expect(200);
            await request(app).post(`/api/admin/withdrawals/${body.withdrawal._id}/paid`).set(auth(admin.token)).send({ reference, currentPassword: PASSWORD }).expect(200);
        };
        await pay(1000, 'UTR000001');
        await pay(500, 'UTR000002');
        await pay(250, 'UTR000003');

        const csv = 'Date,UTR,Amount\n2026-09-27,UTR000001,"1,000.00"\n2026-09-27,UTR000002,499.00\n2026-09-27,UTR999999,42.00\n';
        const res = await request(app).post('/api/admin/withdrawals/statement').set(auth(admin.token)).set('Content-Type', 'text/csv').send(csv);
        expect(res.status).toBe(200);
        expect(res.body.matched).toHaveLength(1);
        expect(res.body.amountMismatch).toHaveLength(1);
        expect(res.body.amountMismatch[0]).toMatchObject({ reference: 'UTR000002', amountMinor: 49900, expectedMinor: 50000 });
        expect(res.body.unknown.map((u) => u.reference)).toEqual(['UTR999999']);
        expect(res.body.unmatchedPaid.map((w) => w.payoutReference).sort()).toEqual(['UTR000002', 'UTR000003']);
    });
});
