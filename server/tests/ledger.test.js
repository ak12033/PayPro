import { describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import {
    transferFunds,
    creditWallet,
    debitWallet,
    applyManualTransaction,
    creditFromPayment,
    LedgerError,
} from '../services/ledgerService.js';

/**
 * Regression tests for the money-integrity defects.
 *
 * Each test below corresponds to a specific bug that shipped in this codebase.
 * They exist so those bugs cannot silently return.
 */

const makeUser = (overrides = {}) => User.create({
    firstName: 'Test',
    email: `u${new mongoose.Types.ObjectId()}@example.com`,
    password: 'hashed',
    accountBalance: 0,
    // Every real write keeps the two columns in step; so must the fixture.
    balanceMinor: Math.round((overrides.accountBalance ?? 0) * 100),
    ...overrides,
});

describe('ledger: balance arithmetic', () => {
    it('credits and debits atomically', async () => {
        const user = await makeUser({ accountBalance: 100 });

        await creditWallet(user._id, 50);
        expect((await User.findById(user._id)).accountBalance).toBe(150);

        await debitWallet(user._id, 30);
        expect((await User.findById(user._id)).accountBalance).toBe(120);
    });

    it('refuses a debit that would overdraw, and leaves the balance untouched', async () => {
        const user = await makeUser({ accountBalance: 100 });

        const result = await debitWallet(user._id, 150);

        expect(result).toBeNull();
        expect((await User.findById(user._id)).accountBalance).toBe(100);
    });

    it('keeps 2-decimal amounts exact (no float drift)', async () => {
        const user = await makeUser({ accountBalance: 0 });

        // 0.1 + 0.2 === 0.30000000000000004 in raw IEEE-754.
        await creditWallet(user._id, 0.1);
        await creditWallet(user._id, 0.2);

        const balance = (await User.findById(user._id)).accountBalance;
        expect(Number(balance.toFixed(2))).toBe(0.3);
    });
});

describe('ledger: transferFunds', () => {
    let sender;
    let recipient;

    beforeEach(async () => {
        sender = await makeUser({ firstName: 'Alice', accountBalance: 1000 });
        recipient = await makeUser({ firstName: 'Bob', accountBalance: 0 });
    });

    it('moves money and writes exactly two ledger rows', async () => {
        const result = await transferFunds({
            senderId: sender._id,
            recipientId: recipient._id,
            amount: 250,
            senderName: 'Alice',
            recipientName: 'Bob',
        });

        expect(result.sender.accountBalance).toBe(750);
        expect(result.recipient.accountBalance).toBe(250);

        const rows = await Transaction.find({ transferGroupId: result.transferGroupId });
        expect(rows).toHaveLength(2);
        expect(rows.filter((r) => r.type === 'Debit')).toHaveLength(1);
        expect(rows.filter((r) => r.type === 'Credit')).toHaveLength(1);
        expect(rows.every((r) => r.amount === 250)).toBe(true);
    });

    /**
     * BUG: `sender` and `recipient` were two in-memory copies of the SAME
     * document. `sender.save()` wrote balance-amount, then `recipient.save()`
     * overwrote it with balance+amount — so a self-transfer increased the
     * user's balance by the transfer amount, out of nothing.
     */
    it('rejects a self-transfer instead of minting money', async () => {
        await expect(
            transferFunds({
                senderId: sender._id,
                recipientId: sender._id,
                amount: 500,
                senderName: 'Alice',
                recipientName: 'Alice',
            })
        ).rejects.toThrow(LedgerError);

        expect((await User.findById(sender._id)).accountBalance).toBe(1000);
        expect(await Transaction.countDocuments({})).toBe(0);
    });

    /**
     * BUG: read balance -> check -> save() whole document. Concurrent transfers
     * all read the same starting balance, all passed the check, and all wrote,
     * letting a user spend several times what they had.
     */
    it('allows only as many concurrent transfers as the balance covers', async () => {
        const attempts = Array.from({ length: 5 }, () =>
            transferFunds({
                senderId: sender._id,
                recipientId: recipient._id,
                amount: 800,
                senderName: 'Alice',
                recipientName: 'Bob',
            }).then(() => 'ok').catch((e) => e.code)
        );

        const outcomes = await Promise.all(attempts);

        expect(outcomes.filter((o) => o === 'ok')).toHaveLength(1);
        expect(outcomes.filter((o) => o === 'INSUFFICIENT_FUNDS')).toHaveLength(4);

        // The decisive assertion: money is conserved.
        const [a, b] = await Promise.all([
            User.findById(sender._id),
            User.findById(recipient._id),
        ]);
        expect(a.accountBalance).toBe(200);
        expect(b.accountBalance).toBe(800);
        expect(a.accountBalance + b.accountBalance).toBe(1000);
    });

    it('conserves total money across many interleaved transfers', async () => {
        const before = 1000;

        await Promise.all(
            Array.from({ length: 10 }, () =>
                transferFunds({
                    senderId: sender._id,
                    recipientId: recipient._id,
                    amount: 50,
                    senderName: 'Alice',
                    recipientName: 'Bob',
                }).catch(() => null)
            )
        );

        const [a, b] = await Promise.all([
            User.findById(sender._id),
            User.findById(recipient._id),
        ]);

        expect(a.accountBalance + b.accountBalance).toBe(before);
    });

    it('rolls back entirely when the recipient does not exist', async () => {
        const ghost = new mongoose.Types.ObjectId();

        await expect(
            transferFunds({
                senderId: sender._id,
                recipientId: ghost,
                amount: 100,
                senderName: 'Alice',
                recipientName: 'Ghost',
            })
        ).rejects.toThrow(LedgerError);

        // The sender must not have been debited for a transfer that never landed.
        expect((await User.findById(sender._id)).accountBalance).toBe(1000);
        expect(await Transaction.countDocuments({})).toBe(0);
    });

    it('refuses to transfer more than the sender holds', async () => {
        await expect(
            transferFunds({
                senderId: sender._id,
                recipientId: recipient._id,
                amount: 5000,
                senderName: 'Alice',
                recipientName: 'Bob',
            })
        ).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });

        expect((await User.findById(sender._id)).accountBalance).toBe(1000);
    });
});

describe('ledger: manual transactions', () => {
    /**
     * Regression: this used to call debitWallet/creditWallet like every other
     * write path, which meant `POST /transactions/add` with
     * `{type: "income", amount: 999999}` minted real spendable balance for
     * money that never moved. A manual entry is a note, not a movement — it
     * must never touch `accountBalance`.
     */
    it('records the entry without touching accountBalance', async () => {
        const user = await makeUser({ accountBalance: 500 });

        const { user: returned, transaction } = await applyManualTransaction({
            userId: user._id,
            description: 'Coffee',
            amount: 120,
            type: 'Debit',
            category: 'Food',
            icon: 'Utensils',
        });

        expect(returned.accountBalance).toBe(500);
        expect((await User.findById(user._id)).accountBalance).toBe(500);
        expect(transaction.type).toBe('Debit');
        expect(transaction.settlement).toBe('none');
        expect(transaction.source).toBe('manual');
        expect(transaction.invoiceId).toMatch(/^AP/);
    });

    it('never blocks on balance, since no money moves', async () => {
        const user = await makeUser({ accountBalance: 50 });

        const { transaction } = await applyManualTransaction({
            userId: user._id,
            description: 'Bigger than my wallet, recorded anyway',
            amount: 100000,
            type: 'Debit',
            category: 'Food',
            icon: 'Utensils',
        });

        expect(transaction.amount).toBe(100000);
        expect((await User.findById(user._id)).accountBalance).toBe(50);
    });
});

describe('ledger: invoice ids', () => {
    it('issues a unique invoice id per entry under concurrency', async () => {
        const user = await makeUser({ accountBalance: 10000 });

        await Promise.all(
            Array.from({ length: 25 }, (_, i) =>
                creditFromPayment({
                    userId: user._id,
                    amount: 10,
                    description: `Top up ${i}`,
                    paymentRef: `order_${i}`,
                })
            )
        );

        const ids = (await Transaction.find({}).select('invoiceId')).map((t) => t.invoiceId);
        expect(ids).toHaveLength(25);
        expect(new Set(ids).size).toBe(25);
    });
});

describe('ledger: the balance guard reads integer paise (plan.md §7.4 step 3)', () => {
    it('spends a balance down to exactly zero through amounts a double cannot represent', async () => {
        const user = await makeUser({ accountBalance: 0.3 });

        expect(await debitWallet(user._id, 0.1)).not.toBeNull();
        // The rupee column is now 0.19999999999999998. A guard on it refused
        // the next debit of 0.20; the paise guard sees exactly 20.
        expect(await debitWallet(user._id, 0.2)).not.toBeNull();

        const after = await User.findById(user._id);
        expect(after.balanceMinor).toBe(0);
    });

    it('refuses when balanceMinor is short, whatever the rupee column says', async () => {
        const user = await makeUser({ accountBalance: 100, balanceMinor: 5000 });

        expect(await debitWallet(user._id, 60)).toBeNull();
        expect((await User.findById(user._id)).balanceMinor).toBe(5000);
    });

    it('keeps writing the rupee column in step, as the rollback path', async () => {
        const user = await makeUser({ accountBalance: 10 });
        await creditWallet(user._id, 2.5);
        await debitWallet(user._id, 1.25);

        const after = await User.findById(user._id);
        expect(after.balanceMinor).toBe(1125);
        expect(after.accountBalance).toBe(11.25);
    });
});
