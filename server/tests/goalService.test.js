import { describe, it, expect, vi } from 'vitest';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Goal from '../models/Goal.js';
import GoalContribution from '../models/GoalContribution.js';
import Notification from '../models/Notification.js';
import { createGoal, addContribution, removeContribution, getProjection } from '../services/goalService.js';

vi.mock('../utils/socket.js', () => ({ emitToUser: vi.fn(), getIO: vi.fn(), initSocket: vi.fn(), default: {} }));
vi.mock('../utils/fcm.js', () => ({ sendPushNotification: vi.fn().mockResolvedValue({ success: true, failedTokens: [] }), default: {} }));

const makeUser = (balance = 5000) => User.create({
    firstName: 'Goalie', email: `g${new mongoose.Types.ObjectId()}@example.com`, password: 'hashed', accountBalance: balance, balanceMinor: Math.round(balance * 100),
});

describe('goalService — the wallet-isolation invariant (plan.md §15.2)', () => {
    it('a contribution never changes User.accountBalance', async () => {
        const user = await makeUser(5000);
        const goal = await createGoal(user._id, { name: 'Trip', targetMinor: 1000000, targetDate: new Date(Date.now() + 90 * 86400000) });

        await addContribution(user._id, goal._id, { amountMinor: 200000, direction: 'in' });

        const reloaded = await User.findById(user._id);
        expect(reloaded.accountBalance).toBe(5000);
    });

    it('a withdrawal (correction) also never changes User.accountBalance', async () => {
        const user = await makeUser(5000);
        const goal = await createGoal(user._id, { name: 'Trip', targetMinor: 1000000, targetDate: new Date(Date.now() + 90 * 86400000) });
        await addContribution(user._id, goal._id, { amountMinor: 200000, direction: 'in' });
        await addContribution(user._id, goal._id, { amountMinor: 50000, direction: 'out' });

        const reloaded = await User.findById(user._id);
        expect(reloaded.accountBalance).toBe(5000);

        const updatedGoal = await Goal.findById(goal._id);
        expect(updatedGoal.currentMinor).toBe(150000);
    });

    it('rejects a withdrawal larger than the tracked progress', async () => {
        const user = await makeUser();
        const goal = await createGoal(user._id, { name: 'Trip', targetMinor: 1000000, targetDate: new Date(Date.now() + 90 * 86400000) });
        await addContribution(user._id, goal._id, { amountMinor: 10000, direction: 'in' });

        await expect(
            addContribution(user._id, goal._id, { amountMinor: 50000, direction: 'out' })
        ).rejects.toThrow();
    });
});

describe('goalService — completion', () => {
    it('reaching the target sets status completed and fires exactly one notification', async () => {
        const user = await makeUser();
        const goal = await createGoal(user._id, { name: 'Emergency fund', targetMinor: 100000, targetDate: new Date(Date.now() + 90 * 86400000) });

        const { goal: afterFirst } = await addContribution(user._id, goal._id, { amountMinor: 60000, direction: 'in' });
        expect(afterFirst.status).toBe('active');

        const { goal: afterSecond } = await addContribution(user._id, goal._id, { amountMinor: 40000, direction: 'in' });
        expect(afterSecond.status).toBe('completed');
        expect(afterSecond.completedAt).toBeTruthy();

        const notifications = await Notification.find({ userId: user._id, type: 'Goal' });
        expect(notifications).toHaveLength(1);

        // A completed goal no longer accepts contributions, so it never fires again.
        await expect(
            addContribution(user._id, goal._id, { amountMinor: 100, direction: 'in' })
        ).rejects.toThrow();

        expect(await Notification.countDocuments({ userId: user._id, type: 'Goal' })).toBe(1);
    });
});

describe('goalService.removeContribution', () => {
    it('reverses a contribution\'s effect on currentMinor and deletes the row', async () => {
        const user = await makeUser();
        const goal = await createGoal(user._id, { name: 'Trip', targetMinor: 1000000, targetDate: new Date(Date.now() + 90 * 86400000) });
        const { contribution } = await addContribution(user._id, goal._id, { amountMinor: 200000, direction: 'in' });

        const updated = await removeContribution(user._id, goal._id, contribution._id);
        expect(updated.currentMinor).toBe(0);
        expect(await GoalContribution.findById(contribution._id)).toBeNull();
    });

    it('un-completes a goal if removing a contribution drops it back under target', async () => {
        const user = await makeUser();
        const goal = await createGoal(user._id, { name: 'Trip', targetMinor: 100000, targetDate: new Date(Date.now() + 90 * 86400000) });
        const { contribution } = await addContribution(user._id, goal._id, { amountMinor: 100000, direction: 'in' });
        expect((await Goal.findById(goal._id)).status).toBe('completed');

        await removeContribution(user._id, goal._id, contribution._id);
        const reloaded = await Goal.findById(goal._id);
        expect(reloaded.status).toBe('active');
        expect(reloaded.currentMinor).toBe(0);
    });
});

describe('goalService.getProjection', () => {
    it('computes requiredMonthlyMinor and reports overdue for a past target date', async () => {
        const user = await makeUser();
        const pastDate = new Date(Date.now() - 5 * 86400000);
        const goal = await createGoal(user._id, { name: 'Overdue', targetMinor: 100000, targetDate: pastDate });

        const projection = await getProjection(user._id, goal._id);
        expect(projection.overdue).toBe(true);
        expect(projection.requiredMonthlyMinor).toBeGreaterThan(0);
    });

    it('reports onTrack as null for a goal younger than a month (not enough history)', async () => {
        const user = await makeUser();
        const goal = await createGoal(user._id, { name: 'New goal', targetMinor: 100000, targetDate: new Date(Date.now() + 90 * 86400000) });

        const projection = await getProjection(user._id, goal._id);
        expect(projection.onTrack).toBeNull();
    });
});
