import { describe, it, expect, vi } from 'vitest';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import AuditLog, { AUDIT } from '../models/AuditLog.js';
import { toPaise } from '../utils/money.js';

vi.mock('../utils/socket.js', () => ({
    emitToUser: vi.fn(), getIO: vi.fn(), initSocket: vi.fn(), default: {},
}));

/**
 * plan.md §4.4 — the refund path's negative balance, made explicit — and the
 * reconciliation bug found next to it (REFUNDED rows dropped from the balance
 * invariant). Dynamic imports for the same config/env.js reason every other
 * suite documents (see phase1.test.js).
 */
const {
    creditFromPayment, debitForRefund, transferFunds, overdraftMinorFor,
} = await import('../services/ledgerService.js');
const { reconcileBalances, repairAccountBalance } = await import('../services/reconciliationService.js');

const makeUser = (email) => User.create({ firstName: 'T', email, password: 'x' });

/** A top-up followed by spending, so a later refund finds the money gone. */
const toppedUpThenSpent = async ({ topUp, spend }) => {
    const user = await makeUser(`od-${Math.random().toString(36).slice(2)}@example.com`);
    const other = await makeUser(`od-other-${Math.random().toString(36).slice(2)}@example.com`);
    await creditFromPayment({ userId: user._id, amount: topUp, description: 'Top up', paymentRef: 'order_od' });
    if (spend) {
        await transferFunds({ senderId: user._id, recipientId: other._id, amount: spend, senderName: 'T', recipientName: 'O' });
    }
    return { user, other };
};

const waitForAudit = () => new Promise((r) => setTimeout(r, 50));

describe('overdraftMinorFor', () => {
    it('is zero at or above zero and the positive shortfall below it', () => {
        expect(overdraftMinorFor(0)).toBe(0);
        expect(overdraftMinorFor(12.5)).toBe(0);
        expect(overdraftMinorFor(-12.34)).toBe(1234);
    });
});

describe('debitForRefund below zero (plan.md §4.4)', () => {
    it('allows the negative balance, but says so: row, return value and audit', async () => {
        const { user } = await toppedUpThenSpent({ topUp: 500, spend: 400 });

        const { user: after, transaction, overdraft } = await debitForRefund({
            userId: user._id, amount: 500, description: 'Refund', paymentRef: 'order_od',
        });

        expect(after.accountBalance).toBe(-400);
        expect(after.balanceMinor).toBe(-40000);
        expect(overdraft).toEqual({ crossedZero: true, overdraftMinor: 40000 });
        expect((await Transaction.findById(transaction._id)).overdraftMinor).toBe(40000);

        await waitForAudit();
        const entries = await AuditLog.find({ action: AUDIT.WALLET_OVERDRAFT, userId: user._id });
        expect(entries).toHaveLength(1);
        expect(entries[0].metadata.overdraftMinor).toBe(40000);
    });

    it('does not audit a refund that leaves the balance at or above zero', async () => {
        const { user } = await toppedUpThenSpent({ topUp: 500, spend: 0 });

        const { overdraft, transaction } = await debitForRefund({
            userId: user._id, amount: 500, description: 'Refund', paymentRef: 'order_od',
        });

        expect(overdraft.crossedZero).toBe(false);
        expect(overdraft.overdraftMinor).toBe(0);
        expect((await Transaction.findById(transaction._id)).overdraftMinor).toBeUndefined();
        await waitForAudit();
        expect(await AuditLog.countDocuments({ action: AUDIT.WALLET_OVERDRAFT })).toBe(0);
    });

    it('audits the crossing once — a second refund on an already-negative balance is not a new event', async () => {
        const { user } = await toppedUpThenSpent({ topUp: 500, spend: 450 });

        const first = await debitForRefund({ userId: user._id, amount: 100, description: 'Refund 1' });
        const second = await debitForRefund({ userId: user._id, amount: 100, description: 'Refund 2' });

        expect(first.overdraft.crossedZero).toBe(true);
        expect(second.overdraft.crossedZero).toBe(false);
        expect(second.overdraft.overdraftMinor).toBe(15000);
        await waitForAudit();
        expect(await AuditLog.countDocuments({ action: AUDIT.WALLET_OVERDRAFT })).toBe(1);
    });

    it('an overdrawn account cannot spend, and a credit clears the debt', async () => {
        const { user, other } = await toppedUpThenSpent({ topUp: 500, spend: 400 });
        await debitForRefund({ userId: user._id, amount: 500, description: 'Refund' });

        await expect(transferFunds({
            senderId: user._id, recipientId: other._id, amount: 1, senderName: 'T', recipientName: 'O',
        })).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });

        await creditFromPayment({ userId: user._id, amount: 600, description: 'Top up 2', paymentRef: 'order_od2' });
        expect((await User.findById(user._id)).accountBalance).toBe(200);
    });

    it('the schema no longer rejects a negative balance on save (it was never enforced on $inc anyway)', async () => {
        const user = await makeUser('od-schema@example.com');
        user.accountBalance = -5;
        await expect(user.validate()).resolves.toBeUndefined();
    });
});

describe('reconciliation after a refund (REFUNDED rows are part of the balance)', () => {
    it('reports no drift for a refunded top-up', async () => {
        const { user } = await toppedUpThenSpent({ topUp: 500, spend: 0 });
        await debitForRefund({ userId: user._id, amount: 500, description: 'Refund', paymentRef: 'order_od' });

        // The original credit is now REFUNDED; the reversal is a SUCCESS debit.
        expect((await Transaction.findOne({ paymentRef: 'order_od', type: 'Credit' })).status).toBe('REFUNDED');
        expect(await reconcileBalances({ userId: user._id })).toEqual([]);
    });

    it('reports no drift for a refund that overdrew the account', async () => {
        const { user } = await toppedUpThenSpent({ topUp: 500, spend: 400 });
        await debitForRefund({ userId: user._id, amount: 500, description: 'Refund', paymentRef: 'order_od' });
        expect(await reconcileBalances({ userId: user._id })).toEqual([]);
    });

    it('repair does not "correct" a refunded account into a wrong balance, and keeps balanceMinor in step', async () => {
        const { user } = await toppedUpThenSpent({ topUp: 500, spend: 0 });
        await debitForRefund({ userId: user._id, amount: 200, description: 'Partial refund', paymentRef: 'order_od' });

        const clean = await repairAccountBalance(user._id);
        expect(clean.repaired).toBe(false);

        // Now introduce genuine drift and repair it.
        await User.updateOne({ _id: user._id }, { $inc: { accountBalance: 50, balanceMinor: 5000 } });
        const repaired = await repairAccountBalance(user._id);
        expect(repaired.repaired).toBe(true);

        const after = await User.findById(user._id);
        expect(after.accountBalance).toBe(300);
        expect(after.balanceMinor).toBe(toPaise(300));
    });
});
