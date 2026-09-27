import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import AuditLog, { AUDIT } from '../models/AuditLog.js';
import { checkTransferLimits, checkBalanceCeiling, LIMITS } from '../services/limitService.js';
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

const { buildTestApp } = await import('./helpers/app.js');

let app;
beforeAll(() => { app = buildTestApp(); });

const makeUser = () => User.create({
    firstName: 'Lim',
    email: `l${new mongoose.Types.ObjectId()}@example.com`,
    password: 'hashed',
});

const settledTransfer = (userId, amount) => Transaction.create({
    userId,
    description: 'past transfer',
    amount,
    type: 'Debit',
    category: 'Transfer',
    invoiceId: `T${new mongoose.Types.ObjectId()}`,
    status: 'SUCCESS',
    settlement: 'settled',
    source: 'p2p',
});

describe('limitService.checkTransferLimits (unit)', () => {
    it('rejects a single transfer above the per-transaction ceiling for the tier', async () => {
        const user = await makeUser();
        const overPerTxn = LIMITS.unverified.perTxnMinor / 100 + 1;
        await expect(
            checkTransferLimits({ userId: user._id, tier: 'unverified', amount: overPerTxn })
        ).rejects.toThrow(LedgerError);
    });

    it('allows a transfer within every ceiling', async () => {
        const user = await makeUser();
        await expect(
            checkTransferLimits({ userId: user._id, tier: 'unverified', amount: 100 })
        ).resolves.toBeUndefined();
    });

    it("rejects once today's settled transfers plus this one would exceed the daily ceiling", async () => {
        const user = await makeUser();
        const daily = LIMITS.unverified.dailyMinor / 100;
        await settledTransfer(user._id, daily - 100);

        await expect(
            checkTransferLimits({ userId: user._id, tier: 'unverified', amount: 200 })
        ).rejects.toThrow(LedgerError);
    });

    it('does not count a PENDING transfer toward the daily total', async () => {
        const user = await makeUser();
        const daily = LIMITS.unverified.dailyMinor / 100;
        await Transaction.create({
            userId: user._id,
            description: 'not yet settled',
            amount: daily,
            type: 'Debit',
            category: 'Transfer',
            invoiceId: `T${new mongoose.Types.ObjectId()}`,
            status: 'PENDING',
            settlement: 'settled',
            source: 'p2p',
        });

        await expect(
            checkTransferLimits({ userId: user._id, tier: 'unverified', amount: 100 })
        ).resolves.toBeUndefined();
    });

    it('an unrecognised or missing tier falls back to the unverified ceiling', async () => {
        const user = await makeUser();
        const overPerTxn = LIMITS.unverified.perTxnMinor / 100 + 1;
        await expect(
            checkTransferLimits({ userId: user._id, tier: undefined, amount: overPerTxn })
        ).rejects.toThrow(LedgerError);
    });

    it('a higher tier tolerates an amount the unverified tier would reject', async () => {
        const user = await makeUser();
        const overUnverifiedPerTxn = LIMITS.unverified.perTxnMinor / 100 + 1;
        await expect(
            checkTransferLimits({ userId: user._id, tier: 'basic', amount: overUnverifiedPerTxn })
        ).resolves.toBeUndefined();
    });
});

describe('limitService.checkBalanceCeiling (unit)', () => {
    it('rejects a top-up that would push an unverified wallet over its ceiling', () => {
        const maxBalance = LIMITS.unverified.maxBalanceMinor / 100;
        expect(() =>
            checkBalanceCeiling({ tier: 'unverified', currentBalance: maxBalance - 50, amount: 100 })
        ).toThrow(LedgerError);
    });

    it('the full tier has no ceiling', () => {
        expect(() =>
            checkBalanceCeiling({ tier: 'full', currentBalance: 10_000_000, amount: 10_000_000 })
        ).not.toThrow();
    });
});

describe('sendMoney enforces the per-transaction limit end-to-end', () => {
    it('rejects a transfer above the ceiling and leaves both balances untouched', async () => {
        const signup = async (email) => {
            const res = await request(app).post('/api/auth/signup')
                .send({ firstName: email.split('@')[0], email, password: 'Str0ngPass99' });
            return { token: res.body.accessToken, id: res.body.user._id };
        };
        const auth = (t) => ({ Authorization: `Bearer ${t}` });

        const alice = await signup('limit-alice@example.com');
        const bob = await signup('limit-bob@example.com');
        // Comfortably above the amount attempted, so this exercises the limit
        // check specifically and not the ordinary balance check.
        await User.updateOne({ _id: alice.id }, { $set: { accountBalance: 100000, balanceMinor: 10000000 } });

        const overPerTxn = LIMITS.unverified.perTxnMinor / 100 + 1;
        const res = await request(app).post('/api/transactions/transfer')
            .set(auth(alice.token))
            .send({ recipientId: bob.id, amount: overPerTxn });

        expect(res.status).toBe(400);
        expect((await User.findById(alice.id)).accountBalance).toBe(100000);

        await new Promise((r) => setTimeout(r, 50));
        expect(await AuditLog.findOne({ action: AUDIT.LIMIT_EXCEEDED })).toBeTruthy();
    });
});
