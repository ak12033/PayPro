import { describe, it, expect, vi } from 'vitest';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';

vi.mock('../utils/socket.js', () => ({
    emitToUser: vi.fn(), getIO: vi.fn(), initSocket: vi.fn(), default: {},
}));

const { backfillMinorColumns, verifyMinorColumns, checkMinorReadiness } = await import('../services/minorBackfillService.js');
const { transferFunds, creditFromPayment } = await import('../services/ledgerService.js');

/**
 * plan.md §7.4 step 2. Legacy documents are written through the raw driver
 * (`collection.insertOne`), bypassing Mongoose, because that is the only way
 * to reproduce a pre-Phase-2 row: every Mongoose write path today populates
 * the minor columns, which is the point of step 1.
 */

let seq = 0;
const legacyUser = async ({ accountBalance, balanceMinor } = {}) => {
    seq += 1;
    const doc = {
        firstName: 'Legacy', email: `legacy-${seq}@example.com`, password: 'x',
        accountBalance, createdAt: new Date(), updatedAt: new Date(),
    };
    if (balanceMinor !== undefined) doc.balanceMinor = balanceMinor;
    const { insertedId } = await User.collection.insertOne(doc);
    return insertedId;
};

const legacyTx = async (userId, { amount, type }) => {
    seq += 1;
    const { insertedId } = await Transaction.collection.insertOne({
        userId, description: 'legacy', amount, type, category: 'Others',
        invoiceId: `INV-LEGACY-${seq}`, createdAt: new Date(), updatedAt: new Date(),
        // No status/settlement/amountMinor: exactly what a pre-Phase-1 row looks like.
    });
    return insertedId;
};

describe('backfillMinorColumns', () => {
    it('is a dry run by default: counts, writes nothing', async () => {
        const userId = await legacyUser({ accountBalance: 100 });
        await legacyTx(userId, { amount: 100, type: 'Credit' });

        const result = await backfillMinorColumns();

        expect(result.dryRun).toBe(true);
        expect(result.lifecycle).toMatchObject({ pending: 1, updated: 0 });
        expect(result.transactions).toMatchObject({ pending: 1, updated: 0 });
        expect(result.users).toMatchObject({ pending: 1, updated: 0 });
        expect((await Transaction.collection.findOne({ userId })).amountMinor).toBeUndefined();
    });

    it('fills missing amountMinor and corrects a partial balanceMinor', async () => {
        // A pre-Phase-2 user: ₹250 of history, then ₹50 more after dual-write
        // started — so $inc left balanceMinor at 5000, not 30000.
        const userId = await legacyUser({ accountBalance: 300, balanceMinor: 5000 });
        await legacyTx(userId, { amount: 250, type: 'Credit' });

        const result = await backfillMinorColumns({ dryRun: false });

        expect(result.transactions.updated).toBe(1);
        expect(result.users.updated).toBe(1);
        expect((await Transaction.collection.findOne({ userId })).amountMinor).toBe(25000);
        expect((await User.collection.findOne({ _id: userId })).balanceMinor).toBe(30000);
    });

    it('rounds instead of truncating IEEE-754 noise (19.99 * 100 is 1998.999…)', async () => {
        const userId = await legacyUser({ accountBalance: 19.99 });
        await legacyTx(userId, { amount: 19.99, type: 'Credit' });

        await backfillMinorColumns({ dryRun: false });

        expect((await Transaction.collection.findOne({ userId })).amountMinor).toBe(1999);
        expect((await User.collection.findOne({ _id: userId })).balanceMinor).toBe(1999);
    });

    it('is idempotent: a second run matches nothing', async () => {
        const userId = await legacyUser({ accountBalance: 10 });
        await legacyTx(userId, { amount: 10, type: 'Credit' });

        await backfillMinorColumns({ dryRun: false });
        const second = await backfillMinorColumns({ dryRun: false });

        expect(second.lifecycle).toMatchObject({ pending: 0, updated: 0 });
        expect(second.transactions).toMatchObject({ pending: 0, updated: 0 });
        expect(second.users).toMatchObject({ pending: 0, updated: 0 });
    });

    it('works across several batches', async () => {
        const userId = await legacyUser({ accountBalance: 0 });
        for (let i = 0; i < 7; i++) await legacyTx(userId, { amount: i + 1, type: 'Credit' });
        await legacyTx(userId, { amount: 28, type: 'Debit' });

        const result = await backfillMinorColumns({ dryRun: false, batchSize: 3 });

        expect(result.transactions.updated).toBe(8);
        expect(result.transactions.batches).toBe(3);
        expect(await Transaction.collection.countDocuments({ amountMinor: { $exists: false } })).toBe(0);
    });

    it('leaves rows already written by the dual-write path untouched', async () => {
        const a = await User.create({ firstName: 'A', email: 'dual-a@example.com', password: 'x' });
        const b = await User.create({ firstName: 'B', email: 'dual-b@example.com', password: 'x' });
        await creditFromPayment({ userId: a._id, amount: 100, description: 'Top up', paymentRef: 'order_dual' });
        await transferFunds({ senderId: a._id, recipientId: b._id, amount: 40, senderName: 'A', recipientName: 'B' });

        const result = await backfillMinorColumns({ dryRun: false });
        expect(result.lifecycle.updated).toBe(0);
        expect(result.transactions.updated).toBe(0);
        expect(result.users.updated).toBe(0);
    });
});

describe('lifecycle backfill for pre-Phase-1 rows', () => {
    it('makes legacy rows visible to the settled-row queries that silently skipped them', async () => {
        const { reconcileBalances } = await import('../services/reconciliationService.js');
        // ₹100 in, ₹30 out, balance ₹70 — a perfectly consistent legacy account
        // (balanceMinor set so the balance side is visible to the paise
        // comparison; only the ledger side is under test here).
        const userId = await legacyUser({ accountBalance: 70, balanceMinor: 7000 });
        await legacyTx(userId, { amount: 100, type: 'Credit' });
        await legacyTx(userId, { amount: 30, type: 'Debit' });

        // Before: `{ settlement: 'settled' }` cannot match a row with no stored
        // settlement, so the ledger looks empty and the account looks drifted.
        const before = await reconcileBalances({ userId });
        expect(before).toHaveLength(1);
        expect(before[0].expectedBalance).toBe(0);

        const result = await backfillMinorColumns({ dryRun: false });
        expect(result.lifecycle.updated).toBe(2);

        expect(await reconcileBalances({ userId })).toEqual([]);
        const row = await Transaction.collection.findOne({ userId, type: 'Credit' });
        expect(row).toMatchObject({ status: 'SUCCESS', settlement: 'settled' });
    });

    it('never overwrites a lifecycle field a row already has', async () => {
        const userId = await legacyUser({ accountBalance: 0 });
        await Transaction.collection.insertOne({
            userId, description: 'half-legacy', amount: 5, type: 'Credit', invoiceId: 'INV-HALF-1',
            status: 'FAILED', createdAt: new Date(),
        });

        await backfillMinorColumns({ dryRun: false });

        const row = await Transaction.collection.findOne({ invoiceId: 'INV-HALF-1' });
        expect(row).toMatchObject({ status: 'FAILED', settlement: 'settled' });
    });
});

describe('verifyMinorColumns (the go/no-go for step 3)', () => {
    it('is unhealthy before the backfill and healthy after it', async () => {
        const userId = await legacyUser({ accountBalance: 70 });
        await legacyTx(userId, { amount: 100, type: 'Credit' });
        await legacyTx(userId, { amount: 30, type: 'Debit' });

        const before = await verifyMinorColumns();
        expect(before.healthy).toBe(false);
        expect(before.summary.transactionsMissingOrMismatched).toBe(2);
        expect(before.summary.usersMissingOrMismatched).toBe(1);

        await backfillMinorColumns({ dryRun: false });

        const after = await verifyMinorColumns();
        expect(after.healthy).toBe(true);
        expect(after.summary).toEqual({
            transactionsMissingLifecycle: 0,
            transactionsMissingOrMismatched: 0,
            usersMissingOrMismatched: 0,
            accountsWithMinorLedgerDrift: 0,
        });
    });

    it('reports genuine ledger drift that a backfill cannot fix, in integer paise', async () => {
        // The balance says ₹80 but the ledger only justifies ₹70 — a real
        // discrepancy. Copying ₹80 into balanceMinor preserves it; verify must
        // still say so rather than calling the columns "consistent".
        const userId = await legacyUser({ accountBalance: 80 });
        await legacyTx(userId, { amount: 100, type: 'Credit' });
        await legacyTx(userId, { amount: 30, type: 'Debit' });

        await backfillMinorColumns({ dryRun: false });
        const report = await verifyMinorColumns();

        expect(report.healthy).toBe(false);
        expect(report.ledgerDrift).toHaveLength(1);
        expect(String(report.ledgerDrift[0]._id)).toBe(String(userId));
        expect(report.ledgerDrift[0]).toMatchObject({
            balanceMinor: 8000,
            expectedMinor: 7000,
            driftMinor: 1000,
        });
    });

    it('ignores manual notes and pending rows, exactly as the rupee invariant does', async () => {
        const userId = await legacyUser({ accountBalance: 50 });
        await legacyTx(userId, { amount: 50, type: 'Credit' });
        await Transaction.collection.insertOne({
            userId, description: 'cash lunch', amount: 999, type: 'Debit', invoiceId: 'INV-MANUAL-1',
            settlement: 'none', status: 'SUCCESS', createdAt: new Date(),
        });
        await Transaction.collection.insertOne({
            userId, description: 'pending topup', amount: 500, type: 'Credit', invoiceId: 'INV-PENDING-1',
            settlement: 'settled', status: 'PENDING', createdAt: new Date(),
        });

        await backfillMinorColumns({ dryRun: false });
        expect((await verifyMinorColumns()).healthy).toBe(true);
    });
});

describe('checkMinorReadiness (the boot-time check for §7.4 step 3)', () => {
    it('reports a user whose balanceMinor would make the paise guard refuse real money', async () => {
        await legacyUser({ accountBalance: 100 });

        const result = await checkMinorReadiness();
        expect(result.ready).toBe(false);
        expect(result.usersMismatched).toBe(1);
    });

    it('is ready once the backfill has run', async () => {
        const userId = await legacyUser({ accountBalance: 100 });
        await legacyTx(userId, { amount: 100, type: 'Credit' });

        await backfillMinorColumns({ dryRun: false });

        expect(await checkMinorReadiness()).toEqual({ ready: true, usersMismatched: 0, transactionsMissingLifecycle: 0 });
    });

    it('does not count transactions that merely lack amountMinor — reads fall back for those', async () => {
        const userId = await legacyUser({ accountBalance: 5, balanceMinor: 500 });
        await Transaction.collection.insertOne({
            userId, description: 'no minor', amount: 5, type: 'Credit', invoiceId: 'INV-NOMINOR-1',
            status: 'SUCCESS', settlement: 'settled', createdAt: new Date(),
        });

        expect((await checkMinorReadiness()).ready).toBe(true);
    });
});
