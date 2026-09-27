import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import Insight from '../models/Insight.js';
import Goal from '../models/Goal.js';
import RecurringExpense from '../models/RecurringExpense.js';
import { computeSpend, getBudgetForPeriod } from './budgetService.js';
import { getProjection } from './goalService.js';
import { notifyUser } from './notificationService.js';
import { categoryKind } from '../constants/categories.js';
import { startOfMonthIST, endOfMonthIST, monthKeyIST } from '../utils/period.js';
import { toPaise, fromPaise, amountMinorOf, AMOUNT_MINOR_EXPR } from '../utils/money.js';

/**
 * All eight of plan.md §24.3's deterministic insight rules.
 *
 * Six landed in Phase 3. `RECURRING_INCREASE` and `NEW_RECURRING` were deferred
 * because both need `RecurringExpense` (§18); that model now exists, so they
 * are implemented here and the rule set is complete.
 *
 * Every rule is a pure computation over the existing ledger/budget/goal data
 * — no model call, no cost, safe to run on a schedule for every user.
 */

const median = (values) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Upsert-by-slug so a re-run of the same rule for the same period updates rather than duplicates. */
const upsertInsight = async ({ userId, kind, slug, title, body, severity, periodStart, data }) => {
    const insight = await Insight.findOneAndUpdate(
        { userId, kind, periodStart, 'data.slug': slug },
        { $set: { title, body, severity, data: { ...data, slug }, dismissedAt: null } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await notifyUser(
        userId, 'Insight', title, body, { insightId: String(insight._id), kind },
        { category: 'insight', dedupeKey: `insight:${userId}:${kind}:${slug}:${monthKeyIST(periodStart)}` }
    );

    return insight;
};

const monthlyIncomeExpense = async (userId, anchor) => {
    const start = startOfMonthIST(anchor);
    const end = endOfMonthIST(anchor);
    const rows = await Transaction.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId), status: 'SUCCESS', settlement: 'settled', postedAt: { $gte: start, $lt: end } } },
        { $project: { type: 1, category: 1, amount: AMOUNT_MINOR_EXPR } },
    ]);
    // Paise — only ever used as a ratio below, so no conversion back is needed.
    let income = 0;
    let expenses = 0;
    for (const r of rows) {
        const kind = categoryKind(r.category);
        if (r.type === 'Credit' && (kind === 'income' || kind === 'both')) income += r.amount;
        else if (r.type === 'Debit' && kind !== 'transfer') expenses += r.amount;
    }
    return { income, expenses };
};

const ruleCategorySpike = async (userId, now) => {
    const start = startOfMonthIST(now);
    const end = endOfMonthIST(now);
    const current = await computeSpend(userId, start, end);

    const pastMonths = await Promise.all([1, 2, 3].map((i) => {
        const anchor = new Date(now);
        anchor.setMonth(anchor.getMonth() - i);
        return computeSpend(userId, startOfMonthIST(anchor), endOfMonthIST(anchor));
    }));

    const results = [];
    for (const { category, spentMinor } of current.byCategory) {
        if (spentMinor <= toPaise(500)) continue;
        const history = pastMonths.map((m) => m.byCategory.find((c) => c.category === category)?.spentMinor ?? 0);
        const baseline = median(history);
        if (baseline > 0 && spentMinor > baseline * 1.25) {
            results.push(await upsertInsight({
                userId, kind: 'CATEGORY_SPIKE', slug: category,
                title: `${category} spending is up`,
                body: `You've spent ₹${(spentMinor / 100).toFixed(2)} on ${category} this month, well above your usual ₹${(baseline / 100).toFixed(2)}.`,
                severity: 'warning', periodStart: start,
                data: { category, spentMinor, baselineMinor: baseline },
            }));
        }
    }
    return results;
};

const ruleBudgetPace = async (userId, now) => {
    const budget = await getBudgetForPeriod(userId, monthKeyIST(now));
    if (!budget?.totalLimitMinor) return [];

    const spend = await computeSpend(userId, budget.periodStart, budget.periodEnd);
    const daysElapsed = Math.max(1, Math.ceil((now - budget.periodStart) / (24 * 60 * 60 * 1000)));
    const daysInPeriod = Math.ceil((budget.periodEnd - budget.periodStart) / (24 * 60 * 60 * 1000));
    const daysLeft = daysInPeriod - daysElapsed;
    if (daysLeft < 5) return [];

    const projected = (spend.totalSpentMinor / daysElapsed) * daysInPeriod;
    if (projected <= budget.totalLimitMinor) return [];

    const overBy = projected - budget.totalLimitMinor;
    return [await upsertInsight({
        userId, kind: 'BUDGET_PACE', slug: 'total',
        title: 'On track to go over budget',
        body: `At your current rate you'll finish this month about ₹${(overBy / 100).toFixed(2)} over your ₹${(budget.totalLimitMinor / 100).toFixed(2)} budget.`,
        severity: 'warning', periodStart: budget.periodStart,
        data: { projectedMinor: Math.round(projected), limitMinor: budget.totalLimitMinor, daysLeft },
    })];
};

const ruleLowSavingsRate = async (userId, now) => {
    const rate = (m) => (m.income > 0 ? (m.income - m.expenses) / m.income : null);
    const thisMonth = await monthlyIncomeExpense(userId, now);
    const lastMonthAnchor = new Date(now); lastMonthAnchor.setMonth(lastMonthAnchor.getMonth() - 1);
    const lastMonth = await monthlyIncomeExpense(userId, lastMonthAnchor);

    const r1 = rate(thisMonth);
    const r2 = rate(lastMonth);
    if (r1 === null || r2 === null) return []; // no income recorded either month — not a meaningful signal
    if (r1 >= 0.10 || r2 >= 0.10) return [];

    return [await upsertInsight({
        userId, kind: 'LOW_SAVINGS_RATE', slug: 'trailing-2mo',
        title: 'Savings rate is low',
        body: `You've saved less than 10% of your income for two months running (${(r1 * 100).toFixed(1)}% this month).`,
        severity: 'warning', periodStart: startOfMonthIST(now),
        data: { currentRatePct: Number((r1 * 100).toFixed(1)), previousRatePct: Number((r2 * 100).toFixed(1)) },
    })];
};

const ruleUnusualLargeTxn = async (userId, now) => {
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const history = await Transaction.find({
        userId, type: 'Debit', status: 'SUCCESS', postedAt: { $gte: ninetyDaysAgo, $lt: sevenDaysAgo },
    }).select('amount amountMinor').lean();
    if (history.length < 5) return []; // too little history to call anything "unusual"

    const baselineMinor = median(history.map(amountMinorOf));
    if (baselineMinor <= 0) return [];
    const baseline = fromPaise(baselineMinor);

    const recent = await Transaction.find({
        userId, type: 'Debit', status: 'SUCCESS', postedAt: { $gte: sevenDaysAgo, $lte: now },
    }).sort({ amount: -1 }).limit(1).lean();

    const biggest = recent[0];
    if (!biggest || amountMinorOf(biggest) <= baselineMinor * 3) return [];
    const biggestAmount = fromPaise(amountMinorOf(biggest));

    return [await upsertInsight({
        userId, kind: 'UNUSUAL_LARGE_TXN', slug: String(biggest._id),
        title: 'Unusually large transaction',
        body: `A recent ${biggest.category} payment of ₹${biggestAmount.toFixed(2)} for "${biggest.description}" is much larger than your typical ₹${baseline.toFixed(2)} debit.`,
        severity: 'info', periodStart: startOfMonthIST(now),
        data: { transactionId: String(biggest._id), amount: biggestAmount, baseline },
    })];
};

const ruleIncomeGap = async (userId, now) => {
    // Filtered in JS since `categoryKind` isn't a stored field — the income
    // category set is small, so this is a cheap in-memory filter over an
    // already-indexed, already-sorted, bounded fetch rather than a new index.
    const candidates = await Transaction.find({ userId, type: 'Credit', status: 'SUCCESS' })
        .sort({ postedAt: -1 }).limit(50).select('category postedAt').lean();
    const lastIncome = candidates.find((t) => ['income', 'both'].includes(categoryKind(t.category))) ?? null;

    if (!lastIncome) return [];
    const daysSince = (now - new Date(lastIncome.postedAt)) / (24 * 60 * 60 * 1000);
    if (daysSince <= 40) return [];

    // Only flag a *change* in an established pattern: at least 3 of the prior
    // 4 months (before the gap started) had an income credit.
    const priorMonths = await Promise.all([1, 2, 3, 4].map(async (i) => {
        const anchor = new Date(lastIncome.postedAt);
        anchor.setMonth(anchor.getMonth() - i);
        const { start, end } = { start: startOfMonthIST(anchor), end: endOfMonthIST(anchor) };
        const hit = await Transaction.findOne({
            userId, type: 'Credit', status: 'SUCCESS', postedAt: { $gte: start, $lt: end },
        }).lean();
        return Boolean(hit);
    }));
    if (priorMonths.filter(Boolean).length < 3) return [];

    return [await upsertInsight({
        userId, kind: 'INCOME_GAP', slug: 'gap',
        title: 'No income received in a while',
        body: `It's been ${Math.floor(daysSince)} days since your last income credit, longer than your usual monthly pattern.`,
        severity: 'warning', periodStart: startOfMonthIST(now),
        data: { daysSince: Math.floor(daysSince), lastIncomeAt: lastIncome.postedAt },
    })];
};

const ruleGoalBehind = async (userId, now) => {
    const goals = await Goal.find({ userId, status: 'active' }).select('_id name').lean();
    const results = [];

    for (const goal of goals) {
        const projection = await getProjection(userId, goal._id);
        const previous = await Insight.findOne({
            userId, kind: 'GOAL_BEHIND', 'data.slug': String(goal._id),
        }).sort({ createdAt: -1 }).lean();

        const previousRequired = previous?.data?.requiredMonthlyMinor;
        if (previousRequired && projection.requiredMonthlyMinor > previousRequired * 1.2) {
            results.push(await upsertInsight({
                userId, kind: 'GOAL_BEHIND', slug: String(goal._id),
                title: `"${goal.name}" needs more per month`,
                body: `To stay on track for "${goal.name}" you'd now need to save ₹${(projection.requiredMonthlyMinor / 100).toFixed(2)}/month, up from ₹${(previousRequired / 100).toFixed(2)}.`,
                severity: 'warning', periodStart: startOfMonthIST(now),
                data: { requiredMonthlyMinor: projection.requiredMonthlyMinor },
            }));
        } else if (!previous) {
            // First run: record the baseline silently (no notification-worthy
            // change yet), so the next run has something to compare against.
            await Insight.create({
                userId, kind: 'GOAL_BEHIND', title: '', body: '', severity: 'info',
                periodStart: startOfMonthIST(now), dismissedAt: new Date(),
                data: { slug: String(goal._id), requiredMonthlyMinor: projection.requiredMonthlyMinor },
            });
        }
    }
    return results;
};


/**
 * A recurring payment whose amount went up (plan.md §24.3).
 *
 * Compares the detector's current representative amount against the one this
 * rule last recorded, so a price rise is reported once rather than every week
 * until the user dismisses it. Like `GOAL_BEHIND`, the first run only records
 * a baseline: there is nothing to compare a first observation against, and
 * inventing one would mean announcing a "rise" that never happened.
 */
const ruleRecurringIncrease = async (userId, now) => {
    const items = await RecurringExpense.find({ userId, status: 'active' })
        .select('_id displayName amountMinor cadence').lean();

    const results = [];
    for (const item of items) {
        const previous = await Insight.findOne({
            userId, kind: 'RECURRING_INCREASE', 'data.slug': String(item._id),
        }).sort({ createdAt: -1 }).lean();

        const previousAmount = previous?.data?.amountMinor;

        // 10% — below that, a variable-amount subscription's normal drift would
        // generate an alert most months and train the user to ignore all of them.
        if (previousAmount && item.amountMinor > previousAmount * 1.1) {
            const deltaPct = Math.round(((item.amountMinor - previousAmount) / previousAmount) * 100);
            results.push(await upsertInsight({
                userId, kind: 'RECURRING_INCREASE', slug: String(item._id),
                title: `${item.displayName} costs more now`,
                body: `This ${item.cadence} payment went from ₹${(previousAmount / 100).toFixed(2)} to ₹${(item.amountMinor / 100).toFixed(2)} — about ${deltaPct}% more.`,
                severity: 'warning', periodStart: startOfMonthIST(now),
                data: { amountMinor: item.amountMinor, previousAmountMinor: previousAmount, deltaPct },
            }));
        } else if (!previous) {
            await Insight.create({
                userId, kind: 'RECURRING_INCREASE', title: '', body: '', severity: 'info',
                periodStart: startOfMonthIST(now), dismissedAt: new Date(),
                data: { slug: String(item._id), amountMinor: item.amountMinor },
            });
        } else if (item.amountMinor !== previousAmount) {
            // Moved, but not enough to report. Re-baseline anyway, so a series of
            // small rises doesn't accumulate into one misleadingly large alert
            // months later.
            await Insight.updateOne(
                { _id: previous._id },
                { $set: { 'data.amountMinor': item.amountMinor } }
            );
        }
    }
    return results;
};

/**
 * A newly detected recurring payment (plan.md §24.3).
 *
 * Framed as an observation, never as a claim about a subscription the user
 * holds — §18.3's copy rule. Only detections above the confidence floor and
 * first seen inside the last window are announced; the detector upserts
 * continuously, so "new" means new to the user, which is what `upsertInsight`'s
 * slug-based dedupe already encodes.
 */
const ruleNewRecurring = async (userId, now) => {
    const since = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const items = await RecurringExpense.find({
        userId,
        status: 'active',
        confidence: { $gte: 0.7 },
        createdAt: { $gte: since },
    }).select('_id displayName amountMinor cadence nextExpectedAt').lean();

    return Promise.all(items.map((item) => upsertInsight({
        userId, kind: 'NEW_RECURRING', slug: String(item._id),
        title: `Looks like a recurring payment`,
        body: `${item.displayName} looks like it repeats ${item.cadence} at about ₹${(item.amountMinor / 100).toFixed(2)}. If that's wrong, you can dismiss it.`,
        severity: 'info', periodStart: startOfMonthIST(now),
        data: { amountMinor: item.amountMinor, cadence: item.cadence, nextExpectedAt: item.nextExpectedAt },
    })));
};

export const generateForUser = async (userId, { now = new Date() } = {}) => {
    const results = await Promise.allSettled([
        ruleCategorySpike(userId, now),
        ruleBudgetPace(userId, now),
        ruleLowSavingsRate(userId, now),
        ruleUnusualLargeTxn(userId, now),
        ruleIncomeGap(userId, now),
        ruleGoalBehind(userId, now),
        ruleRecurringIncrease(userId, now),
        ruleNewRecurring(userId, now),
    ]);

    return results
        .filter((r) => r.status === 'fulfilled')
        .flatMap((r) => r.value);
};

export const listInsights = (userId, { status = 'active' } = {}) => {
    const query = { userId };
    if (status === 'active') query.dismissedAt = null;
    return Insight.find(query).sort({ createdAt: -1 }).limit(50).lean();
};

export const dismissInsight = async (userId, insightId) => {
    const insight = await Insight.findOneAndUpdate(
        { _id: insightId, userId },
        { $set: { dismissedAt: new Date() } },
        { new: true }
    );
    return insight;
};
