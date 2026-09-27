import { describe, it, expect, vi } from 'vitest';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Budget from '../models/Budget.js';
import BudgetAlert from '../models/BudgetAlert.js';
import Notification from '../models/Notification.js';
import { computeSpend, createBudget, evaluateAfterTransaction } from '../services/budgetService.js';
import { monthBoundsIST } from '../utils/period.js';

vi.mock('../utils/socket.js', () => ({ emitToUser: vi.fn(), getIO: vi.fn(), initSocket: vi.fn(), default: {} }));
vi.mock('../utils/fcm.js', () => ({ sendPushNotification: vi.fn().mockResolvedValue({ success: true, failedTokens: [] }), default: {} }));

const makeUser = () => User.create({
    firstName: 'Bud', email: `b${new mongoose.Types.ObjectId()}@example.com`, password: 'hashed',
});

const makeTx = (userId, overrides = {}) => Transaction.create({
    userId,
    description: 'test row',
    amount: 100,
    type: 'Debit',
    category: 'Food',
    status: 'SUCCESS',
    settlement: 'settled',
    source: 'manual',
    invoiceId: `T${new mongoose.Types.ObjectId()}`,
    postedAt: new Date(),
    ...overrides,
});

describe('budgetService.computeSpend', () => {
    it('is zero for a period with no transactions', async () => {
        const user = await makeUser();
        const { start, end } = monthBoundsIST();
        const result = await computeSpend(user._id, start, end);
        expect(result.totalSpentMinor).toBe(0);
        expect(result.byCategory).toEqual([]);
    });

    it('excludes Refund and Stripe categories, and non-SUCCESS rows', async () => {
        const user = await makeUser();
        const { start, end } = monthBoundsIST();

        await makeTx(user._id, { category: 'Food', amount: 100 });
        await makeTx(user._id, { category: 'Refund', amount: 500 });
        await makeTx(user._id, { category: 'Stripe', amount: 500 });
        await makeTx(user._id, { category: 'Food', amount: 999, status: 'FAILED' });
        await makeTx(user._id, { category: 'Food', amount: 999, status: 'PENDING' });

        const result = await computeSpend(user._id, start, end);
        expect(result.totalSpentMinor).toBe(10000); // just the one ₹100 Food row, in paise
    });

    it('includes manual (off-ledger) rows — they describe real spending even though settlement is "none"', async () => {
        const user = await makeUser();
        const { start, end } = monthBoundsIST();
        await makeTx(user._id, { category: 'Food', amount: 250, settlement: 'none', source: 'manual' });

        const result = await computeSpend(user._id, start, end);
        expect(result.totalSpentMinor).toBe(25000);
    });

    it('includes P2P transfers sent (category Transfer) as spend', async () => {
        const user = await makeUser();
        const { start, end } = monthBoundsIST();
        await makeTx(user._id, { category: 'Transfer', amount: 300, source: 'p2p' });

        const result = await computeSpend(user._id, start, end);
        expect(result.totalSpentMinor).toBe(30000);
    });

    it('excludes a Top Up row entirely, even if it were somehow a Debit', async () => {
        const user = await makeUser();
        const { start, end } = monthBoundsIST();
        await makeTx(user._id, { category: 'Top Up', amount: 400, source: 'topup' });

        const result = await computeSpend(user._id, start, end);
        expect(result.totalSpentMinor).toBe(0);
    });

    it('an IST month boundary transaction counts in the correct calendar month, not UTC\'s', async () => {
        const user = await makeUser();
        // October 1st 00:15 IST == September 30th 18:45 UTC. A naive UTC month
        // boundary would file this under September; the correct IST answer is
        // October.
        const octBounds = monthBoundsIST('2026-10');
        const sepBounds = monthBoundsIST('2026-09');
        const boundaryInstant = new Date(octBounds.start.getTime() + 15 * 60 * 1000);

        await makeTx(user._id, { category: 'Food', amount: 700, postedAt: boundaryInstant });

        const october = await computeSpend(user._id, octBounds.start, octBounds.end);
        const september = await computeSpend(user._id, sepBounds.start, sepBounds.end);

        expect(october.totalSpentMinor).toBe(70000);
        expect(september.totalSpentMinor).toBe(0);
    });

    it('moving a transaction between categories moves its amount for spend purposes (re-categorisation, §12.4)', async () => {
        const user = await makeUser();
        const { start, end } = monthBoundsIST();
        const tx = await makeTx(user._id, { category: 'Food', amount: 150 });

        let result = await computeSpend(user._id, start, end);
        expect(result.byCategory.find((c) => c.category === 'Food')?.spentMinor).toBe(15000);

        tx.category = 'Shopping';
        await tx.save();

        result = await computeSpend(user._id, start, end);
        expect(result.byCategory.find((c) => c.category === 'Food')).toBeUndefined();
        expect(result.byCategory.find((c) => c.category === 'Shopping')?.spentMinor).toBe(15000);
    });
});

describe('budgetService.evaluateAfterTransaction — threshold alerts', () => {
    it('fires the 80% category alert exactly once per period, even across multiple qualifying transactions', async () => {
        const user = await makeUser();
        const budget = await createBudget(user._id, {
            categories: [{ category: 'Food', limitMinor: 100000 }], // ₹1000
        });

        const tx1 = await makeTx(user._id, { category: 'Food', amount: 850 }); // 85%
        await evaluateAfterTransaction(user._id, tx1);

        let alerts = await BudgetAlert.find({ budgetId: budget._id, category: 'Food', threshold: 80 });
        expect(alerts).toHaveLength(1);

        const tx2 = await makeTx(user._id, { category: 'Food', amount: 10 }); // still > 80%
        await evaluateAfterTransaction(user._id, tx2);

        alerts = await BudgetAlert.find({ budgetId: budget._id, category: 'Food', threshold: 80 });
        expect(alerts).toHaveLength(1); // still exactly one — the unique index dedupes
    });

    it('does not fire a threshold for a transaction outside any budgeted category', async () => {
        const user = await makeUser();
        await createBudget(user._id, { categories: [{ category: 'Food', limitMinor: 100000 }] });

        const tx = await makeTx(user._id, { category: 'Entertainment', amount: 5000 });
        await evaluateAfterTransaction(user._id, tx);

        const alerts = await BudgetAlert.find({});
        expect(alerts).toHaveLength(0);
    });

    it('writes a Notification of type Budget when a threshold fires', async () => {
        const user = await makeUser();
        await createBudget(user._id, { categories: [{ category: 'Food', limitMinor: 100000 }] });
        const tx = await makeTx(user._id, { category: 'Food', amount: 550 }); // 55% — only the 50% band crosses
        await evaluateAfterTransaction(user._id, tx);

        const notifications = await Notification.find({ userId: user._id, type: 'Budget' });
        expect(notifications).toHaveLength(1);
    });

    it('never sends more than 3 budget notifications per user per day (§14.2)', async () => {
        const user = await makeUser();
        await createBudget(user._id, { categories: [{ category: 'Food', limitMinor: 100000 }] });
        // 120% crosses all four bands (50/80/100/120) on one transaction — the
        // cap must stop the fourth even though it would otherwise qualify.
        const tx = await makeTx(user._id, { category: 'Food', amount: 1200 });
        await evaluateAfterTransaction(user._id, tx);

        const notifications = await Notification.find({ userId: user._id, type: 'Budget' });
        expect(notifications.length).toBeLessThanOrEqual(3);
    });

    it('is a no-op for a non-Debit or non-SUCCESS transaction', async () => {
        const user = await makeUser();
        await createBudget(user._id, { categories: [{ category: 'Food', limitMinor: 100000 }] });

        const credit = await makeTx(user._id, { category: 'Food', type: 'Credit', amount: 5000 });
        await evaluateAfterTransaction(user._id, credit);

        const pending = await makeTx(user._id, { category: 'Food', status: 'PENDING', amount: 5000 });
        await evaluateAfterTransaction(user._id, pending);

        expect(await BudgetAlert.countDocuments({})).toBe(0);
    });
});
