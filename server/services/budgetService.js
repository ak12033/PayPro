import mongoose from 'mongoose';
import Budget from '../models/Budget.js';
import BudgetAlert from '../models/BudgetAlert.js';
import Transaction from '../models/Transaction.js';
import { notifyUser } from './notificationService.js';
import { emitToUser } from '../utils/socket.js';
import { AMOUNT_MINOR_EXPR } from '../utils/money.js';
import { startOfDayIST, startOfMonthIST, endOfMonthIST, monthBoundsIST } from '../utils/period.js';
import { CATEGORY_NAMES, EXCLUDED_FROM_BUDGET, SYSTEM_CATEGORIES } from '../constants/categories.js';
import { TX_SOURCE } from '../constants/transactionStatus.js';

export class BudgetError extends Error {
    constructor(code, message, status = 400) {
        super(message);
        this.name = 'BudgetError';
        this.code = code;
        this.status = status;
    }
}

/** Category-level thresholds fire upward through all four bands; the total budget only ever gets the one headline warning (plan.md §14.1). */
const CATEGORY_THRESHOLDS = [50, 80, 100, 120];
const TOTAL_THRESHOLDS = [80];
const MAX_BUDGET_NOTIFICATIONS_PER_DAY = 3;

/**
 * Spend for a period, grouped by category (plan.md §13.2).
 *
 * Deliberately included: every settled Debit — ordinary spending, P2P sent,
 * and manual records (`settlement:'none'` rows still describe real-world
 * spending even though they never touched the wallet). Deliberately excluded:
 * anything not SUCCESS, and 'Refund'/'Top Up'/'Stripe' — a refund reverses a
 * previous debit rather than describing new spending.
 *
 * Computed fresh on every call, never cached: a denormalised running total
 * would drift the first time a transaction was refunded or re-categorised.
 */
export const computeSpend = async (userId, periodStart, periodEnd) => {
    const rows = await Transaction.aggregate([
        {
            $match: {
                userId: new mongoose.Types.ObjectId(userId),
                type: 'Debit',
                status: 'SUCCESS',
                source: { $nin: [TX_SOURCE.TOPUP, TX_SOURCE.ADJUSTMENT] },
                category: { $nin: EXCLUDED_FROM_BUDGET },
                postedAt: { $gte: periodStart, $lt: periodEnd },
            },
        },
        { $group: { _id: '$category', spent: { $sum: AMOUNT_MINOR_EXPR }, count: { $sum: 1 } } },
    ]);

    const byCategory = rows.map((r) => ({
        category: r._id,
        spentMinor: r.spent,
        count: r.count,
    }));

    const totalSpentMinor = byCategory.reduce((sum, r) => sum + r.spentMinor, 0);

    return { byCategory, totalSpentMinor };
};

const assertValidCategories = (categories = []) => {
    for (const c of categories) {
        if (!CATEGORY_NAMES.includes(c.category) || SYSTEM_CATEGORIES.includes(c.category)) {
            throw new BudgetError('INVALID_CATEGORY', `"${c.category}" is not a category you can budget.`, 400);
        }
        if (!(Number(c.limitMinor) > 0)) {
            throw new BudgetError('INVALID_LIMIT', `${c.category}'s limit must be a positive amount.`, 400);
        }
    }
};

/** The budget whose period covers `date`, or null. */
const findCoveringBudget = (userId, date) => Budget.findOne({
    userId,
    archivedAt: null,
    periodStart: { $lte: date },
    periodEnd: { $gt: date },
});

export const getBudgetForPeriod = async (userId, periodKey = null) => {
    const { start, end } = monthBoundsIST(periodKey);
    return Budget.findOne({ userId, periodStart: start, periodEnd: end, archivedAt: null });
};

export const createBudget = async (userId, payload) => {
    const { start, end } = monthBoundsIST(payload.period ?? null);
    assertValidCategories(payload.categories);

    try {
        return await Budget.create({
            userId,
            periodType: 'monthly',
            periodStart: start,
            periodEnd: end,
            totalLimitMinor: payload.totalLimitMinor ?? undefined,
            expectedIncomeMinor: payload.expectedIncomeMinor ?? undefined,
            categories: payload.categories ?? [],
            rollover: Boolean(payload.rollover),
            recurring: Boolean(payload.recurring),
        });
    } catch (err) {
        if (err?.code === 11000) {
            throw new BudgetError('BUDGET_EXISTS', 'A budget for this period already exists.', 409);
        }
        throw err;
    }
};

export const updateBudget = async (userId, budgetId, payload) => {
    const budget = await Budget.findOne({ _id: budgetId, userId, archivedAt: null });
    if (!budget) throw new BudgetError('NOT_FOUND', 'Budget not found', 404);

    if (payload.categories) assertValidCategories(payload.categories);

    for (const key of ['totalLimitMinor', 'expectedIncomeMinor', 'categories', 'rollover', 'recurring']) {
        if (payload[key] !== undefined) budget[key] = payload[key];
    }

    await budget.save();
    return budget;
};

export const archiveBudget = async (userId, budgetId) => {
    const budget = await Budget.findOneAndUpdate(
        { _id: budgetId, userId, archivedAt: null },
        { $set: { archivedAt: new Date() } },
        { new: true }
    );
    if (!budget) throw new BudgetError('NOT_FOUND', 'Budget not found', 404);
    return budget;
};

/** Past periods with their final spend, newest first — for the "past periods" screen. */
export const getHistory = async (userId, { limit = 12 } = {}) => {
    const budgets = await Budget.find({ userId })
        .sort({ periodStart: -1 })
        .limit(limit)
        .lean();

    return Promise.all(budgets.map(async (budget) => ({
        budget,
        spend: await computeSpend(userId, budget.periodStart, budget.periodEnd),
    })));
};

/**
 * Suggested per-category limits from the median of the last 3 IST months'
 * actual spend (plan.md §13.3). A category absent from a given month counts
 * as ₹0 for that month, so a category only spent in one of three months gets
 * a conservative (low) suggestion rather than being judged on that one month
 * alone.
 */
export const getSuggestions = async (userId) => {
    const now = new Date();
    const months = [0, 1, 2].map((i) => {
        const anchor = new Date(now);
        anchor.setMonth(anchor.getMonth() - i);
        return { start: startOfMonthIST(anchor), end: endOfMonthIST(anchor) };
    });

    const perMonth = await Promise.all(months.map(({ start, end }) => computeSpend(userId, start, end)));

    const totals = new Map();
    for (const { byCategory } of perMonth) {
        for (const { category } of byCategory) {
            if (!totals.has(category)) totals.set(category, [0, 0, 0]);
        }
    }
    perMonth.forEach((month, i) => {
        for (const { category, spentMinor } of month.byCategory) {
            totals.get(category)[i] = spentMinor;
        }
    });

    const median = (arr) => {
        const sorted = [...arr].sort((a, b) => a - b);
        return sorted[1]; // middle of exactly 3 values
    };

    return Array.from(totals.entries())
        .map(([category, values]) => ({ category, suggestedLimitMinor: median(values) }))
        .filter((s) => s.suggestedLimitMinor > 0)
        .sort((a, b) => b.suggestedLimitMinor - a.suggestedLimitMinor);
};

/** Materialise next period's budget from this one (plan.md §13.5). Idempotent via the unique period index. */
export const rollover = async (userId, budgetId) => {
    const template = await Budget.findOne({ _id: budgetId, userId });
    if (!template || template.archivedAt) return null;

    const spend = await computeSpend(template.userId, template.periodStart, template.periodEnd);
    const remaining = Math.max(0, (template.totalLimitMinor ?? 0) - spend.totalSpentMinor);

    const nextTotalLimitMinor = template.rollover && template.totalLimitMinor
        ? Math.min(template.totalLimitMinor + remaining, template.totalLimitMinor * 2)
        : template.totalLimitMinor;

    try {
        return await Budget.create({
            userId: template.userId,
            periodType: 'monthly',
            periodStart: template.periodEnd,
            periodEnd: endOfMonthIST(template.periodEnd),
            totalLimitMinor: nextTotalLimitMinor,
            expectedIncomeMinor: template.expectedIncomeMinor,
            categories: template.categories,
            rollover: template.rollover,
            recurring: template.recurring,
        });
    } catch (err) {
        if (err?.code === 11000) return null; // already rolled over
        throw err;
    }
};

/** Today's IST budget-notification count for `userId`, against the §14.2 cap. */
const todaysAlertCount = (userId) => BudgetAlert.countDocuments({ userId, firedAt: { $gte: startOfDayIST() } });

/**
 * Try to fire one threshold's alert. Returns true if a *new* alert fired.
 * The unique index on BudgetAlert is the actual dedupe mechanism — a
 * duplicate-key error here means this threshold, for this category, in this
 * period, already fired, which is the expected steady-state outcome on every
 * transaction after the first that crosses it.
 */
const tryFireThreshold = async ({ userId, budget, category, threshold, percent, remainingMinor }) => {
    if (percent < threshold) return false;
    if ((await todaysAlertCount(userId)) >= MAX_BUDGET_NOTIFICATIONS_PER_DAY) return false;

    try {
        await BudgetAlert.create({
            userId, budgetId: budget._id, category: category ?? null, threshold, periodStart: budget.periodStart,
        });
    } catch (err) {
        if (err?.code === 11000) return false; // already fired
        throw err;
    }

    const label = category ?? 'monthly';
    const copy = {
        50: `You're halfway through your ${category} budget.`,
        80: category
            ? `You've used 80% of your ${category} budget — ${remainingMinor >= 0 ? `₹${(remainingMinor / 100).toFixed(2)} left` : 'over budget'}.`
            : "You've used 80% of your monthly budget.",
        100: `You've reached your ${category} budget.`,
        120: `You've exceeded your ${category} budget by ₹${Math.abs(remainingMinor / 100).toFixed(2)}.`,
    }[threshold] || `Your ${label} budget crossed ${threshold}%.`;

    await notifyUser(
        userId,
        'Budget',
        category ? `${category} budget alert` : 'Monthly budget alert',
        copy,
        { budgetId: String(budget._id), category, threshold, percent },
        { category: 'budget', dedupeKey: `budget:${budget._id}:${category ?? 'total'}:${threshold}:${budget.periodStart.toISOString()}` }
    );

    return true;
};

/**
 * The hook every settlement path calls, best-effort, after a Debit settles
 * (plan.md §13.7). Never allowed to affect the transaction it's evaluating —
 * every failure here is swallowed by the caller's own best-effort wrapper.
 */
export const evaluateAfterTransaction = async (userId, tx) => {
    if (tx.type !== 'Debit' || tx.status !== 'SUCCESS') return;
    if (EXCLUDED_FROM_BUDGET.includes(tx.category)) return;

    const budget = await findCoveringBudget(userId, tx.postedAt || tx.createdAt);
    if (!budget) return;

    const spend = await computeSpend(userId, budget.periodStart, budget.periodEnd);

    const categoryLimit = budget.categories.find((c) => c.category === tx.category);
    if (categoryLimit) {
        const spent = spend.byCategory.find((c) => c.category === tx.category)?.spentMinor ?? 0;
        const percent = (spent / categoryLimit.limitMinor) * 100;
        for (const threshold of CATEGORY_THRESHOLDS) {
            await tryFireThreshold({
                userId, budget, category: tx.category, threshold, percent,
                remainingMinor: categoryLimit.limitMinor - spent,
            });
        }
    }

    if (budget.totalLimitMinor) {
        const percent = (spend.totalSpentMinor / budget.totalLimitMinor) * 100;
        for (const threshold of TOTAL_THRESHOLDS) {
            await tryFireThreshold({
                userId, budget, category: null, threshold, percent,
                remainingMinor: budget.totalLimitMinor - spend.totalSpentMinor,
            });
        }
    }

    emitToUser(String(userId), 'budget_update', { budgetId: String(budget._id), periodStart: budget.periodStart });
};

/** Re-evaluate the covering budget after a transaction's category changes (plan.md §12.4). */
export const recomputePeriod = async (userId, tx) => evaluateAfterTransaction(userId, tx);
