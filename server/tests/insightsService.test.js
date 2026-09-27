import { describe, it, expect, vi } from 'vitest';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Insight from '../models/Insight.js';
import { generateForUser, listInsights, dismissInsight } from '../services/insightsService.js';
import { startOfMonthIST, endOfMonthIST } from '../utils/period.js';

vi.mock('../utils/socket.js', () => ({ emitToUser: vi.fn(), getIO: vi.fn(), initSocket: vi.fn(), default: {} }));
vi.mock('../utils/fcm.js', () => ({ sendPushNotification: vi.fn().mockResolvedValue({ success: true, failedTokens: [] }), default: {} }));

const makeUser = () => User.create({
    firstName: 'Ins', email: `i${new mongoose.Types.ObjectId()}@example.com`, password: 'hashed',
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

describe('insightsService — CATEGORY_SPIKE', () => {
    it('fires when this month\'s spend is > 1.25x the 3-month median and > ₹500', async () => {
        const user = await makeUser();
        const now = new Date();

        // Baseline: ₹200/month for the prior 3 months.
        for (let i = 1; i <= 3; i++) {
            const anchor = new Date(now); anchor.setMonth(anchor.getMonth() - i);
            await makeTx(user._id, { category: 'Shopping', amount: 200, postedAt: startOfMonthIST(anchor) });
        }
        // This month: ₹800 — well over 1.25x the ₹200 baseline and over ₹500.
        await makeTx(user._id, { category: 'Shopping', amount: 800, postedAt: now });

        await generateForUser(user._id, { now });

        const insight = await Insight.findOne({ userId: user._id, kind: 'CATEGORY_SPIKE', 'data.slug': 'Shopping' });
        expect(insight).toBeTruthy();
    });

    it('does not fire for a modest category spend under ₹500', async () => {
        const user = await makeUser();
        const now = new Date();
        await makeTx(user._id, { category: 'Shopping', amount: 100, postedAt: now });

        await generateForUser(user._id, { now });

        const insight = await Insight.findOne({ userId: user._id, kind: 'CATEGORY_SPIKE' });
        expect(insight).toBeNull();
    });
});

describe('insightsService — UNUSUAL_LARGE_TXN', () => {
    it('flags a debit more than 3x the 90-day median', async () => {
        const user = await makeUser();
        const now = new Date();

        // History: five ₹100 debits, all older than 7 days.
        for (let i = 0; i < 5; i++) {
            await makeTx(user._id, { amount: 100, postedAt: new Date(now.getTime() - (10 + i) * 86400000) });
        }
        // Recent: one ₹500 debit (5x the ₹100 median).
        await makeTx(user._id, { amount: 500, description: 'Big purchase', postedAt: now });

        await generateForUser(user._id, { now });

        const insight = await Insight.findOne({ userId: user._id, kind: 'UNUSUAL_LARGE_TXN' });
        expect(insight).toBeTruthy();
        expect(insight.data.amount).toBe(500);
    });

    it('does not flag anything with too little transaction history', async () => {
        const user = await makeUser();
        const now = new Date();
        await makeTx(user._id, { amount: 500, postedAt: now });

        await generateForUser(user._id, { now });

        expect(await Insight.findOne({ userId: user._id, kind: 'UNUSUAL_LARGE_TXN' })).toBeNull();
    });
});

describe('insightsService.listInsights / dismissInsight', () => {
    it('dismissing an insight removes it from the active list', async () => {
        const user = await makeUser();
        const now = new Date();
        for (let i = 0; i < 5; i++) {
            await makeTx(user._id, { amount: 100, postedAt: new Date(now.getTime() - (10 + i) * 86400000) });
        }
        await makeTx(user._id, { amount: 500, postedAt: now });
        await generateForUser(user._id, { now });

        const before = await listInsights(user._id, { status: 'active' });
        expect(before.length).toBeGreaterThan(0);

        await dismissInsight(user._id, before[0]._id);

        const after = await listInsights(user._id, { status: 'active' });
        expect(after.find((i) => String(i._id) === String(before[0]._id))).toBeUndefined();
    });

    it('only ever dismisses the caller\'s own insight', async () => {
        const owner = await makeUser();
        const stranger = await makeUser();
        const now = new Date();
        for (let i = 0; i < 5; i++) {
            await makeTx(owner._id, { amount: 100, postedAt: new Date(now.getTime() - (10 + i) * 86400000) });
        }
        await makeTx(owner._id, { amount: 500, postedAt: now });
        await generateForUser(owner._id, { now });

        const insight = await Insight.findOne({ userId: owner._id });
        const result = await dismissInsight(stranger._id, insight._id);
        expect(result).toBeNull();
        expect((await Insight.findById(insight._id)).dismissedAt).toBeNull();
    });
});
