import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Payment from '../models/Payment.js';
import {
    reconcileBalances,
    findOrphanedTransferLegs,
    reconcilePayments,
    runReconciliation,
    repairAccountBalance,
} from '../services/reconciliationService.js';

const makeUser = (balance) => User.create({
    firstName: 'Recon',
    email: `r${new mongoose.Types.ObjectId()}@example.com`,
    password: 'hashed',
    accountBalance: balance,
    balanceMinor: Math.round(balance * 100),
});

const entry = (userId, type, amount, extra = {}) => Transaction.create({
    userId,
    description: 'test',
    amount,
    type,
    category: extra.category ?? 'Others',
    invoiceId: `T${new mongoose.Types.ObjectId()}`,
    ...extra,
});

describe('reconciliation: balance drift', () => {
    it('reports nothing when the balance matches the ledger', async () => {
        const user = await makeUser(150);
        await entry(user._id, 'Credit', 200);
        await entry(user._id, 'Debit', 50);

        expect(await reconcileBalances()).toHaveLength(0);
    });

    it('detects a balance higher than the ledger justifies', async () => {
        const user = await makeUser(1000);
        await entry(user._id, 'Credit', 400);

        const [drift] = await reconcileBalances();

        expect(drift._id.toString()).toBe(user._id.toString());
        expect(drift.expectedBalance).toBe(400);
        expect(drift.drift).toBe(600); // 600 of unbacked money
    });

    it('detects a balance lower than the ledger justifies', async () => {
        const user = await makeUser(100);
        await entry(user._id, 'Credit', 500);

        const [drift] = await reconcileBalances();
        expect(drift.drift).toBe(-400);
    });

    it('ignores float noise in the rupee column — the comparison is in integer paise', async () => {
        const user = await makeUser(100);
        await User.updateOne({ _id: user._id }, { $set: { accountBalance: 100.00000000000001 } });
        await entry(user._id, 'Credit', 100);

        expect(await reconcileBalances()).toHaveLength(0);
    });

    it('has zero tolerance: a single paisa of drift is reported', async () => {
        const user = await makeUser(100.01);
        await entry(user._id, 'Credit', 100);

        const [drift] = await reconcileBalances();
        expect(drift.driftMinor).toBe(1);
        expect(drift.drift).toBe(0.01);
    });

    it('sums rows that predate amountMinor by deriving it from amount', async () => {
        const user = await makeUser(19.99);
        await Transaction.collection.insertOne({
            userId: user._id, description: 'legacy', amount: 19.99, type: 'Credit',
            status: 'SUCCESS', settlement: 'settled', invoiceId: `T${new mongoose.Types.ObjectId()}`,
        });

        expect(await reconcileBalances()).toHaveLength(0);
    });
});

describe('reconciliation: orphaned transfer legs', () => {
    it('finds a transfer with only one leg', async () => {
        const a = await makeUser(0);
        await entry(a._id, 'Debit', 100, { category: 'Transfer', transferGroupId: 'grp-broken' });

        const orphans = await findOrphanedTransferLegs();
        expect(orphans.map((o) => o._id)).toContain('grp-broken');
    });

    it('ignores a well-formed two-leg transfer', async () => {
        const a = await makeUser(0);
        const b = await makeUser(0);
        await entry(a._id, 'Debit', 100, { category: 'Transfer', transferGroupId: 'grp-ok' });
        await entry(b._id, 'Credit', 100, { category: 'Transfer', transferGroupId: 'grp-ok' });

        const orphans = await findOrphanedTransferLegs();
        expect(orphans.map((o) => o._id)).not.toContain('grp-ok');
    });

    it('flags legs that disagree on amount', async () => {
        const a = await makeUser(0);
        const b = await makeUser(0);
        await entry(a._id, 'Debit', 100, { category: 'Transfer', transferGroupId: 'grp-mismatch' });
        await entry(b._id, 'Credit', 250, { category: 'Transfer', transferGroupId: 'grp-mismatch' });

        const orphans = await findOrphanedTransferLegs();
        expect(orphans.map((o) => o._id)).toContain('grp-mismatch');
    });
});

describe('reconciliation: payments', () => {
    it('finds a captured payment with no wallet credit', async () => {
        const user = await makeUser(0);
        await Payment.create({
            userId: user._id, orderId: 'order_missing', amount: 500,
            status: 'captured', walletCredited: true,
        });

        const { missingCredits } = await reconcilePayments();
        expect(missingCredits.map((p) => p.orderId)).toContain('order_missing');
    });

    it('finds a wallet credit with no captured payment behind it', async () => {
        const user = await makeUser(0);
        await entry(user._id, 'Credit', 500, { category: 'Top Up', paymentRef: 'order_ghost' });

        const { unbackedCredits } = await reconcilePayments();
        expect(unbackedCredits.map((t) => t.paymentRef)).toContain('order_ghost');
    });
});

describe('reconciliation: report and repair', () => {
    it('reports healthy on a consistent dataset', async () => {
        const user = await makeUser(300);
        await entry(user._id, 'Credit', 300);

        const report = await runReconciliation();
        expect(report.healthy).toBe(true);
        expect(report.summary.driftedAccounts).toBe(0);
    });

    it('corrects a drifted balance to match the ledger', async () => {
        const user = await makeUser(1000);
        await entry(user._id, 'Credit', 250);

        const result = await repairAccountBalance(user._id);

        expect(result.repaired).toBe(true);
        expect(result.previousBalance).toBe(1000);
        expect(result.correctedBalance).toBe(250);

        expect((await User.findById(user._id)).accountBalance).toBe(250);
        expect(await reconcileBalances()).toHaveLength(0);
    });

    it('is a no-op on an already-consistent account', async () => {
        const user = await makeUser(250);
        await entry(user._id, 'Credit', 250);

        const result = await repairAccountBalance(user._id);
        expect(result.repaired).toBe(false);
        expect((await User.findById(user._id)).accountBalance).toBe(250);
    });
});
