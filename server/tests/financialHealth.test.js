import { describe, it, expect, vi } from 'vitest';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Goal from '../models/Goal.js';
import Budget from '../models/Budget.js';
import Transaction from '../models/Transaction.js';
import { getFinancialHealth, COMPONENT_STATUS, WEIGHTS } from '../services/financialHealthService.js';
import { startOfMonthIST, endOfMonthIST } from '../utils/period.js';

vi.mock('../utils/socket.js', () => ({ emitToUser: vi.fn(), getIO: vi.fn(), initSocket: vi.fn(), default: {} }));
vi.mock('../utils/fcm.js', () => ({ sendPushNotification: vi.fn().mockResolvedValue({ success: true, failedTokens: [] }), default: {} }));

const makeUser = () => User.create({
    firstName: 'Health', email: `h${new mongoose.Types.ObjectId()}@example.com`, password: 'hashed', accountBalance: 10000, balanceMinor: 1000000,
});

let counter = 0;
const tx = (userId, { type, amount, category, monthsAgo }) => {
    const postedAt = new Date();
    postedAt.setMonth(postedAt.getMonth() - monthsAgo);
    // Mid-month, so a month-boundary shift cannot move the row into a
    // neighbouring bucket and quietly change the arithmetic.
    postedAt.setDate(15);
    return Transaction.create({
        userId, description: `${category} ${monthsAgo}`, amount, type, category,
        invoiceId: `INV-FH-${counter += 1}`, status: 'SUCCESS', settlement: 'settled', postedAt,
    });
};

const componentFor = (result, key) => result.components.find((c) => c.key === key);

describe('financialHealthService — never invent a score from missing data (plan.md §25.1)', () => {
    it('returns a null score for a user with no activity at all', async () => {
        const user = await makeUser();

        const result = await getFinancialHealth(user._id);

        expect(result.score).toBeNull();
        expect(result.band).toBeNull();
        for (const component of result.components) {
            expect(component.status).toBe(COMPONENT_STATUS.INSUFFICIENT_DATA);
            // A missing component must be null, not zero — "we don't know" and
            // "you scored nothing" are different statements.
            expect(component.score).toBeNull();
        }
    });

    it('marks budget adherence insufficient when there is no budget, rather than scoring zero', async () => {
        const user = await makeUser();
        for (const monthsAgo of [1, 2]) {
            await tx(user._id, { type: 'Credit', amount: 50000, category: 'Salary', monthsAgo });
            await tx(user._id, { type: 'Debit', amount: 30000, category: 'Rent', monthsAgo });
        }

        const result = await getFinancialHealth(user._id);
        const budget = componentFor(result, 'budgetAdherence');

        expect(budget.status).toBe(COMPONENT_STATUS.INSUFFICIENT_DATA);
        expect(budget.explanation).toMatch(/budget/i);
        // The score still exists, computed from what *is* known.
        expect(result.score).not.toBeNull();
    });

    it('excludes missing components from the weighted average rather than zeroing them', async () => {
        const user = await makeUser();
        for (const monthsAgo of [1, 2]) {
            await tx(user._id, { type: 'Credit', amount: 50000, category: 'Salary', monthsAgo });
            await tx(user._id, { type: 'Debit', amount: 30000, category: 'Rent', monthsAgo });
        }

        const result = await getFinancialHealth(user._id);
        const scored = result.components.filter((c) => c.status === COMPONENT_STATUS.SCORED);
        const availableWeight = scored.reduce((sum, c) => sum + c.weight, 0);

        // Coverage states plainly how much of the full 100 points this is based on.
        expect(result.coverage).toBe(availableWeight);
        expect(availableWeight).toBeLessThan(100);

        const expected = Math.round(
            scored.reduce((sum, c) => sum + c.score * c.weight, 0) / availableWeight
        );
        expect(result.score).toBe(expected);
    });
});

describe('financialHealthService — components', () => {
    it('scores a 40% savings rate at the top of the band', async () => {
        const user = await makeUser();
        for (const monthsAgo of [1, 2]) {
            await tx(user._id, { type: 'Credit', amount: 100000, category: 'Salary', monthsAgo });
            await tx(user._id, { type: 'Debit', amount: 60000, category: 'Rent', monthsAgo });
        }

        const result = await getFinancialHealth(user._id);

        // 40% saved: above the 30% that scores 100.
        expect(componentFor(result, 'savingsRate').score).toBe(100);
    });

    it('scores a zero savings rate at the bottom', async () => {
        const user = await makeUser();
        for (const monthsAgo of [1, 2]) {
            await tx(user._id, { type: 'Credit', amount: 50000, category: 'Salary', monthsAgo });
            await tx(user._id, { type: 'Debit', amount: 50000, category: 'Rent', monthsAgo });
        }

        const result = await getFinancialHealth(user._id);
        expect(componentFor(result, 'savingsRate').score).toBe(0);
    });

    it('ignores months with no income instead of averaging in a zero', async () => {
        const user = await makeUser();
        // Two paid months, one unpaid — a freelancer's normal year.
        for (const monthsAgo of [1, 2]) {
            await tx(user._id, { type: 'Credit', amount: 100000, category: 'Freelance', monthsAgo });
            await tx(user._id, { type: 'Debit', amount: 60000, category: 'Rent', monthsAgo });
        }
        await tx(user._id, { type: 'Debit', amount: 60000, category: 'Rent', monthsAgo: 0 });

        const result = await getFinancialHealth(user._id);

        // Still 100: the unpaid month says nothing about the savings rate.
        expect(componentFor(result, 'savingsRate').score).toBe(100);
    });

    it('scores budget adherence from how many category limits held', async () => {
        const user = await makeUser();
        const start = startOfMonthIST(new Date());
        const end = endOfMonthIST(new Date());

        await Budget.create({
            userId: user._id, periodStart: start, periodEnd: end,
            categories: [
                { category: 'Rent', limitMinor: 5000000 },   // held
                { category: 'Food', limitMinor: 1000 },      // blown
            ],
        });
        await tx(user._id, { type: 'Debit', amount: 30000, category: 'Rent', monthsAgo: 0 });
        await tx(user._id, { type: 'Debit', amount: 5000, category: 'Food', monthsAgo: 0 });

        const result = await getFinancialHealth(user._id);
        const budget = componentFor(result, 'budgetAdherence');

        expect(budget.status).toBe(COMPONENT_STATUS.SCORED);
        expect(budget.score).toBe(50);
    });

    it('scores the emergency fund against three months of expenses', async () => {
        const user = await makeUser();
        for (const monthsAgo of [1, 2]) {
            await tx(user._id, { type: 'Credit', amount: 100000, category: 'Salary', monthsAgo });
            await tx(user._id, { type: 'Debit', amount: 10000, category: 'Rent', monthsAgo });
        }
        // 3 x ₹10,000 = ₹30,000 target; ₹15,000 tracked is half.
        await Goal.create({
            userId: user._id, name: 'Rainy day', type: 'emergency',
            targetMinor: 3000000, currentMinor: 1500000,
            targetDate: new Date(Date.now() + 365 * 86400000),
        });

        const result = await getFinancialHealth(user._id);
        const fund = componentFor(result, 'emergencyFund');

        expect(fund.status).toBe(COMPONENT_STATUS.SCORED);
        expect(fund.score).toBeCloseTo(50, 0);
        // The goal-isolation caveat must travel with the number (§15.2).
        expect(fund.explanation).toMatch(/tracked, not locked/i);
    });

    it('caps the emergency-fund ratio at 100', async () => {
        const user = await makeUser();
        for (const monthsAgo of [1, 2]) {
            await tx(user._id, { type: 'Credit', amount: 100000, category: 'Salary', monthsAgo });
            await tx(user._id, { type: 'Debit', amount: 1000, category: 'Rent', monthsAgo });
        }
        await Goal.create({
            userId: user._id, name: 'Overfunded', type: 'emergency',
            targetMinor: 100000, currentMinor: 90000000,
            targetDate: new Date(Date.now() + 365 * 86400000),
        });

        expect(componentFor(await getFinancialHealth(user._id), 'emergencyFund').score).toBe(100);
    });

    it('scores a discretionary-heavy spending mix lower than a commitments-heavy one', async () => {
        const disciplined = await makeUser();
        await tx(disciplined._id, { type: 'Debit', amount: 10000, category: 'Rent', monthsAgo: 0 });

        const spendy = await makeUser();
        await tx(spendy._id, { type: 'Debit', amount: 10000, category: 'Entertainment', monthsAgo: 0 });

        const a = componentFor(await getFinancialHealth(disciplined._id), 'spendingDiscipline');
        const b = componentFor(await getFinancialHealth(spendy._id), 'spendingDiscipline');

        expect(a.score).toBeGreaterThan(b.score);
    });
});

describe('financialHealthService — presentation contract (plan.md §25.2)', () => {
    it('always returns the not-a-credit-score disclaimer', async () => {
        const user = await makeUser();
        const result = await getFinancialHealth(user._id);

        expect(result.disclaimer).toMatch(/not a credit score/i);
        expect(result.disclaimer).toMatch(/not used by any lender/i);
    });

    it('recommends unlocking what is missing, capped at three', async () => {
        const user = await makeUser();
        const result = await getFinancialHealth(user._id);

        expect(result.recommendations.length).toBeLessThanOrEqual(3);
        expect(result.recommendations.length).toBeGreaterThan(0);
        for (const rec of result.recommendations) expect(rec.detail).toBeTruthy();
    });

    it("exposes each component's weight so the UI can show its working", async () => {
        const user = await makeUser();
        const result = await getFinancialHealth(user._id);

        const total = result.components.reduce((sum, c) => sum + c.weight, 0);
        expect(total).toBe(100);
        expect(componentFor(result, 'savingsRate').weight).toBe(WEIGHTS.savingsRate);
    });
});
