import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import { getCashflow } from '../services/cashflowService.js';

const makeUser = () => User.create({
    firstName: 'Flow', email: `f${new mongoose.Types.ObjectId()}@example.com`, password: 'hashed',
});

const makeTx = (userId, overrides = {}) => Transaction.create({
    userId,
    description: 'row',
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

describe('cashflowService.getCashflow — income vs "money in" (plan.md §16.1)', () => {
    it('a Salary credit counts as income', async () => {
        const user = await makeUser();
        await makeTx(user._id, { type: 'Credit', category: 'Salary', amount: 50000 });

        const result = await getCashflow(user._id, { range: '1M' });
        expect(result.summary.incomeMinor).toBe(5000000);
        expect(result.summary.moneyInMinor).toBe(5000000);
    });

    it('a Top Up credit counts as money in, but never as income', async () => {
        const user = await makeUser();
        await makeTx(user._id, { type: 'Credit', category: 'Top Up', amount: 500, source: 'topup' });

        const result = await getCashflow(user._id, { range: '1M' });
        expect(result.summary.moneyInMinor).toBe(50000);
        expect(result.summary.incomeMinor).toBe(0);
    });

    it('a P2P transfer received counts as money in, but never as income', async () => {
        const user = await makeUser();
        await makeTx(user._id, { type: 'Credit', category: 'Transfer', amount: 500, source: 'p2p' });

        const result = await getCashflow(user._id, { range: '1M' });
        expect(result.summary.moneyInMinor).toBe(50000);
        expect(result.summary.incomeMinor).toBe(0);
    });

    it('groups expenses into fixed/variable/savings buckets', async () => {
        const user = await makeUser();
        await makeTx(user._id, { category: 'Rent', amount: 10000 }); // fixed
        await makeTx(user._id, { category: 'Entertainment', amount: 2000 }); // variable (lifestyle)
        await makeTx(user._id, { category: 'Savings', amount: 3000 }); // savings

        const result = await getCashflow(user._id, { range: '1M' });
        expect(result.breakdown.fixedMinor).toBe(1000000);
        expect(result.breakdown.variableMinor).toBe(200000);
        expect(result.breakdown.savingsMinor).toBe(300000);
        expect(result.summary.expensesMinor).toBe(1500000);
    });

    it('net and savings rate reflect income minus expenses', async () => {
        const user = await makeUser();
        await makeTx(user._id, { type: 'Credit', category: 'Salary', amount: 10000 });
        await makeTx(user._id, { category: 'Food', amount: 2000 });

        const result = await getCashflow(user._id, { range: '1M' });
        expect(result.summary.netMinor).toBe(800000);
        expect(result.summary.savingsRatePct).toBe(80);
    });
});
