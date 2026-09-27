import { describe, it, expect, vi } from 'vitest';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import RecurringExpense from '../models/RecurringExpense.js';
import {
    normaliseMerchant,
    classifyGroup,
    detectForUser,
    getUpcoming,
    dismissRecurring,
    updateRecurring,
} from '../services/recurringService.js';

vi.mock('../utils/socket.js', () => ({ emitToUser: vi.fn(), getIO: vi.fn(), initSocket: vi.fn(), default: {} }));
vi.mock('../utils/fcm.js', () => ({ sendPushNotification: vi.fn().mockResolvedValue({ success: true, failedTokens: [] }), default: {} }));

const DAY = 86400000;

const makeUser = () => User.create({
    firstName: 'Rec', email: `r${new mongoose.Types.ObjectId()}@example.com`, password: 'hashed', accountBalance: 10000, balanceMinor: 1000000,
});

let invoiceCounter = 0;
const makeTx = (userId, { description, amount, postedAt, category = 'Subscription' }) => Transaction.create({
    userId,
    description,
    amount,
    type: 'Debit',
    category,
    invoiceId: `INV-REC-${invoiceCounter += 1}-${Date.now()}`,
    status: 'SUCCESS',
    settlement: 'settled',
    postedAt,
});

describe('normaliseMerchant', () => {
    it('strips the per-charge noise that stops identical merchants grouping', () => {
        expect(normaliseMerchant('Netflix order 2847')).toBe(normaliseMerchant('Netflix order 9931'));
        expect(normaliseMerchant('SPOTIFY 2026-01-14')).toBe(normaliseMerchant('SPOTIFY 2026-02-14'));
        expect(normaliseMerchant('Amazon Prime ref#ABC12')).toBe('amazon prime');
    });

    it('returns an empty key for a description with nothing groupable in it', () => {
        // Grouping these under '' would merge unrelated merchants into one
        // fictional subscription, which is why detectForUser skips them.
        expect(normaliseMerchant('12345')).toBe('');
        expect(normaliseMerchant('---')).toBe('');
    });
});

describe('classifyGroup — plan.md §18.1 steps 2-5', () => {
    const monthlyAt = (amounts, spacingDays = 30) => amounts.map((amount, i) => ({
        _id: new mongoose.Types.ObjectId(),
        description: 'Netflix',
        category: 'Subscription',
        amount,
        postedAt: new Date(Date.now() - (amounts.length - 1 - i) * spacingDays * DAY),
    }));

    it('detects three equal monthly payments (§18.4)', () => {
        const result = classifyGroup(monthlyAt([649, 649, 649]));
        expect(result).not.toBeNull();
        expect(result.cadence).toBe('monthly');
        expect(result.amountMinor).toBe(64900);
        expect(result.amountVariesFlag).toBe(false);
        expect(result.occurrences).toBe(3);
    });

    it('rejects three payments of wildly differing amounts (§18.4)', () => {
        expect(classifyGroup(monthlyAt([100, 4000, 250]))).toBeNull();
    });

    it('rejects fewer than three occurrences', () => {
        expect(classifyGroup(monthlyAt([649, 649]))).toBeNull();
    });

    it('rejects an interval that falls between cadence bands', () => {
        // 15 days is neither weekly nor monthly. Forcing it into the nearest
        // band would be a guess, so the group is discarded instead.
        expect(classifyGroup(monthlyAt([649, 649, 649, 649], 15))).toBeNull();
    });

    it('classifies weekly and quarterly spacing into their own bands', () => {
        expect(classifyGroup(monthlyAt([200, 200, 200, 200], 7)).cadence).toBe('weekly');
        expect(classifyGroup(monthlyAt([1200, 1200, 1200], 90)).cadence).toBe('quarterly');
    });

    it('accepts small amount variation and marks it as varying', () => {
        const result = classifyGroup(monthlyAt([1000, 1050, 1030]));
        expect(result).not.toBeNull();
        expect(result.amountVariesFlag).toBe(true);
    });

    it('predicts a nextExpectedAt in the future, even for a stale group', () => {
        const now = new Date();
        // Last charge 70 days ago on a monthly cadence: naively predicting one
        // interval forward would land 40 days in the past and read as a
        // missed payment.
        const stale = [
            { _id: new mongoose.Types.ObjectId(), description: 'Gym', category: 'Health', amount: 500, postedAt: new Date(now - 130 * DAY) },
            { _id: new mongoose.Types.ObjectId(), description: 'Gym', category: 'Health', amount: 500, postedAt: new Date(now - 100 * DAY) },
            { _id: new mongoose.Types.ObjectId(), description: 'Gym', category: 'Health', amount: 500, postedAt: new Date(now - 70 * DAY) },
        ];
        const result = classifyGroup(stale, now);
        expect(result).not.toBeNull();
        expect(result.nextExpectedAt.getTime()).toBeGreaterThan(now.getTime());
    });
});

describe('detectForUser', () => {
    it('writes one RecurringExpense per detected merchant', async () => {
        const user = await makeUser();
        const now = Date.now();
        for (const i of [3, 2, 1]) {
            await makeTx(user._id, { description: `Netflix order ${i}00`, amount: 649, postedAt: new Date(now - i * 30 * DAY) });
        }
        // Noise that must not become a detection.
        await makeTx(user._id, { description: 'Corner shop', amount: 120, postedAt: new Date(now - 5 * DAY) });

        const result = await detectForUser(user._id);
        expect(result.created).toBe(1);

        const rows = await RecurringExpense.find({ userId: user._id });
        expect(rows).toHaveLength(1);
        expect(rows[0].cadence).toBe('monthly');
    });

    it('is idempotent — a second run updates rather than duplicating', async () => {
        const user = await makeUser();
        const now = Date.now();
        for (const i of [3, 2, 1]) {
            await makeTx(user._id, { description: 'Spotify', amount: 199, postedAt: new Date(now - i * 30 * DAY) });
        }

        await detectForUser(user._id);
        const second = await detectForUser(user._id);

        expect(second.created).toBe(0);
        expect(second.updated).toBe(1);
        expect(await RecurringExpense.countDocuments({ userId: user._id })).toBe(1);
    });

    it('keeps a dismissal dismissed across subsequent runs (§18.4)', async () => {
        const user = await makeUser();
        const now = Date.now();
        for (const i of [3, 2, 1]) {
            await makeTx(user._id, { description: 'Spotify', amount: 199, postedAt: new Date(now - i * 30 * DAY) });
        }

        await detectForUser(user._id);
        const [row] = await RecurringExpense.find({ userId: user._id });
        await dismissRecurring(user._id, row._id);

        await detectForUser(user._id);

        const after = await RecurringExpense.findById(row._id);
        expect(after.status).toBe('dismissed');
    });

    it('never overwrites a user rename or re-categorisation', async () => {
        const user = await makeUser();
        const now = Date.now();
        for (const i of [3, 2, 1]) {
            await makeTx(user._id, { description: 'Spotify', amount: 199, postedAt: new Date(now - i * 30 * DAY) });
        }
        await detectForUser(user._id);
        const [row] = await RecurringExpense.find({ userId: user._id });

        await updateRecurring(user._id, row._id, { displayName: 'Music', category: 'Entertainment' });
        await detectForUser(user._id);

        const after = await RecurringExpense.findById(row._id);
        expect(after.displayName).toBe('Music');
        expect(after.category).toBe('Entertainment');
        // Observation fields still refresh.
        expect(after.occurrences).toBe(3);
    });

    it('includes manual (settlement:none) rows — the spending PayPro cannot see directly', async () => {
        const user = await makeUser();
        const now = Date.now();
        for (const i of [3, 2, 1]) {
            await Transaction.create({
                userId: user._id, description: 'Rent', amount: 15000, type: 'Debit', category: 'Rent',
                invoiceId: `INV-MAN-${i}-${Date.now()}`, status: 'SUCCESS', settlement: 'none',
                postedAt: new Date(now - i * 30 * DAY),
            });
        }

        const result = await detectForUser(user._id);
        expect(result.created).toBe(1);
    });

    it('excludes refunds and top-ups from the candidate set', async () => {
        const user = await makeUser();
        const now = Date.now();
        for (const i of [3, 2, 1]) {
            await makeTx(user._id, { description: 'Gateway', amount: 500, postedAt: new Date(now - i * 30 * DAY), category: 'Refund' });
        }

        const result = await detectForUser(user._id);
        expect(result.created).toBe(0);
    });
});

describe('getUpcoming', () => {
    it('returns only active detections due inside the window, with a paise total', async () => {
        const user = await makeUser();
        const now = new Date();

        await RecurringExpense.create({
            userId: user._id, merchantKey: 'soon', displayName: 'Soon', amountMinor: 50000,
            cadence: 'monthly', firstSeenAt: now, lastSeenAt: now,
            nextExpectedAt: new Date(now.getTime() + 5 * DAY), occurrences: 3, confidence: 0.8,
        });
        await RecurringExpense.create({
            userId: user._id, merchantKey: 'later', displayName: 'Later', amountMinor: 90000,
            cadence: 'quarterly', firstSeenAt: now, lastSeenAt: now,
            nextExpectedAt: new Date(now.getTime() + 60 * DAY), occurrences: 3, confidence: 0.8,
        });
        await RecurringExpense.create({
            userId: user._id, merchantKey: 'gone', displayName: 'Dismissed', amountMinor: 10000,
            cadence: 'monthly', firstSeenAt: now, lastSeenAt: now,
            nextExpectedAt: new Date(now.getTime() + 2 * DAY), occurrences: 3, confidence: 0.8,
            status: 'dismissed',
        });

        const result = await getUpcoming(user._id, { days: 30, now });

        expect(result.items).toHaveLength(1);
        expect(result.items[0].displayName).toBe('Soon');
        expect(result.totalMinor).toBe(50000);
        expect(result.total).toBe(500);
    });
});
