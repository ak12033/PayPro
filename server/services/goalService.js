import Goal from '../models/Goal.js';
import GoalContribution from '../models/GoalContribution.js';
import { notifyUser } from './notificationService.js';
import { emitToUser } from '../utils/socket.js';

export class GoalError extends Error {
    constructor(code, message, status = 400) {
        super(message);
        this.name = 'GoalError';
        this.code = code;
        this.status = status;
    }
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export const listGoals = (userId, { status } = {}) => {
    const query = { userId };
    if (status) query.status = status;
    return Goal.find(query).sort({ createdAt: -1 }).lean();
};

export const createGoal = (userId, payload) => Goal.create({
    userId,
    name: payload.name,
    type: payload.type || 'custom',
    icon: payload.icon,
    targetMinor: payload.targetMinor,
    targetDate: payload.targetDate,
    autoContribute: payload.autoContribute,
});

export const getGoal = async (userId, goalId) => {
    const goal = await Goal.findOne({ _id: goalId, userId }).lean();
    if (!goal) throw new GoalError('NOT_FOUND', 'Goal not found', 404);
    const contributions = await GoalContribution.find({ goalId }).sort({ at: -1 }).limit(50).lean();
    return { goal, contributions };
};

export const updateGoal = async (userId, goalId, payload) => {
    const goal = await Goal.findOne({ _id: goalId, userId, status: { $ne: 'archived' } });
    if (!goal) throw new GoalError('NOT_FOUND', 'Goal not found', 404);

    for (const key of ['name', 'type', 'icon', 'targetMinor', 'targetDate', 'autoContribute']) {
        if (payload[key] !== undefined) goal[key] = payload[key];
    }
    await goal.save();
    return goal;
};

export const archiveGoal = async (userId, goalId) => {
    const goal = await Goal.findOneAndUpdate(
        { _id: goalId, userId },
        { $set: { status: 'archived', archivedAt: new Date() } },
        { new: true }
    );
    if (!goal) throw new GoalError('NOT_FOUND', 'Goal not found', 404);
    return goal;
};

/**
 * Add money to a goal's tracked progress.
 *
 * This is bookkeeping only — `accountBalance` is never touched, on purpose
 * (plan.md §15.2). A "goal" in this phase is a virtual earmark, not a real
 * reserved pot; every screen that shows one must say so.
 */
export const addContribution = async (userId, goalId, { amountMinor, note = '', direction = 'in' }) => {
    const goal = await Goal.findOne({ _id: goalId, userId, status: 'active' });
    if (!goal) throw new GoalError('NOT_FOUND', 'Active goal not found', 404);

    const delta = direction === 'out' ? -amountMinor : amountMinor;
    if (direction === 'out' && goal.currentMinor < amountMinor) {
        throw new GoalError('INSUFFICIENT_PROGRESS', 'Cannot withdraw more than the goal has tracked', 400);
    }

    const contribution = await GoalContribution.create({
        userId, goalId, amountMinor, direction, note, source: 'manual',
    });

    goal.currentMinor = Math.max(0, goal.currentMinor + delta);

    let justCompleted = false;
    if (goal.status === 'active' && goal.currentMinor >= goal.targetMinor) {
        goal.status = 'completed';
        goal.completedAt = new Date();
        justCompleted = true;
    }

    await goal.save();

    emitToUser(String(userId), 'goal_update', { goalId: String(goal._id), currentMinor: goal.currentMinor });

    if (justCompleted) {
        await notifyUser(
            userId,
            'Goal',
            `Goal reached: ${goal.name}`,
            `You've hit your ₹${(goal.targetMinor / 100).toFixed(2)} target for "${goal.name}". Tracked, not locked — this money is still in your wallet.`,
            { goalId: String(goal._id) },
            { category: 'goal', dedupeKey: `goal:${goal._id}:completed` }
        );
    }

    return { goal, contribution };
};

/** Reverse a mistaken contribution — only ever affects the tracker, never the wallet. */
export const removeContribution = async (userId, goalId, contributionId) => {
    const contribution = await GoalContribution.findOne({ _id: contributionId, goalId, userId });
    if (!contribution) throw new GoalError('NOT_FOUND', 'Contribution not found', 404);

    const goal = await Goal.findOne({ _id: goalId, userId });
    if (!goal) throw new GoalError('NOT_FOUND', 'Goal not found', 404);

    const delta = contribution.direction === 'out' ? contribution.amountMinor : -contribution.amountMinor;
    goal.currentMinor = Math.max(0, goal.currentMinor + delta);
    if (goal.status === 'completed' && goal.currentMinor < goal.targetMinor) {
        goal.status = 'active';
        goal.completedAt = null;
    }

    await Promise.all([goal.save(), GoalContribution.deleteOne({ _id: contributionId })]);

    emitToUser(String(userId), 'goal_update', { goalId: String(goal._id), currentMinor: goal.currentMinor });

    return goal;
};

/**
 * Required monthly contribution + a trailing-90-day on-track read (plan.md
 * §15.3). A goal under a month old has no meaningful contribution rate yet,
 * so `onTrack` is `null` ("not enough history") rather than a false negative.
 */
export const getProjection = async (userId, goalId) => {
    const goal = await Goal.findOne({ _id: goalId, userId }).lean();
    if (!goal) throw new GoalError('NOT_FOUND', 'Goal not found', 404);

    const remainingMinor = Math.max(0, goal.targetMinor - goal.currentMinor);
    const now = Date.now();
    const monthsLeft = Math.max(1, Math.ceil((new Date(goal.targetDate).getTime() - now) / (30 * 24 * 60 * 60 * 1000)));
    const requiredMonthlyMinor = Math.ceil(remainingMinor / monthsLeft);

    const overdue = new Date(goal.targetDate).getTime() < now && goal.status === 'active';

    const ageMs = now - new Date(goal.createdAt).getTime();
    let onTrack = null;
    if (ageMs >= 30 * 24 * 60 * 60 * 1000) {
        const recent = await GoalContribution.aggregate([
            { $match: { goalId: goal._id, at: { $gte: new Date(now - NINETY_DAYS_MS) } } },
            { $group: { _id: '$direction', total: { $sum: '$amountMinor' } } },
        ]);
        const inTotal = recent.find((r) => r._id === 'in')?.total ?? 0;
        const outTotal = recent.find((r) => r._id === 'out')?.total ?? 0;
        const avgMonthly = (inTotal - outTotal) / 3;
        onTrack = avgMonthly >= requiredMonthlyMinor * 0.9;
    }

    return { requiredMonthlyMinor, remainingMinor, monthsLeft, onTrack, overdue };
};
