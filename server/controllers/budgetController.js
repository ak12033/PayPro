import { asyncHandler } from '../utils/asyncHandler.js';
import { asObjectId, asString } from '../utils/sanitize.js';
import { audit } from '../services/auditService.js';
import { AUDIT } from '../models/AuditLog.js';
import {
    computeSpend,
    getBudgetForPeriod,
    createBudget,
    updateBudget,
    archiveBudget,
    getHistory,
    getSuggestions,
    rollover,
    BudgetError,
} from '../services/budgetService.js';

/** Distance from `now` to the end of the period, and total days in it — for the client's "safe daily spend" line (plan.md §13.3). */
const periodStats = (periodStart, periodEnd) => {
    const now = new Date();
    const daysLeft = Math.max(0, Math.ceil((periodEnd - now) / (24 * 60 * 60 * 1000)));
    const daysInPeriod = Math.ceil((periodEnd - periodStart) / (24 * 60 * 60 * 1000));
    const daysElapsed = Math.max(1, daysInPeriod - daysLeft);
    return { daysLeft, daysInPeriod, daysElapsed };
};

const buildResponse = async (budget) => {
    if (!budget) return null;
    const spend = await computeSpend(budget.userId, budget.periodStart, budget.periodEnd);
    const { daysLeft, daysInPeriod, daysElapsed } = periodStats(budget.periodStart, budget.periodEnd);

    const byCategory = budget.categories.map((c) => {
        const spent = spend.byCategory.find((s) => s.category === c.category)?.spentMinor ?? 0;
        const percent = c.limitMinor ? Math.round((spent / c.limitMinor) * 100) : 0;
        return {
            category: c.category,
            spentMinor: spent,
            limitMinor: c.limitMinor,
            percent,
            status: percent >= 100 ? 'over' : percent >= 80 ? 'warning' : 'ok',
        };
    });

    const remainingMinor = budget.totalLimitMinor != null ? budget.totalLimitMinor - spend.totalSpentMinor : null;
    const dailyRate = spend.totalSpentMinor / daysElapsed;
    const projectedTotalMinor = Math.round(dailyRate * daysInPeriod);

    return {
        budget: {
            id: String(budget._id),
            period: budget.periodStart.toISOString().slice(0, 7),
            periodStart: budget.periodStart,
            periodEnd: budget.periodEnd,
            totalLimitMinor: budget.totalLimitMinor ?? null,
            expectedIncomeMinor: budget.expectedIncomeMinor ?? null,
            rollover: budget.rollover,
            recurring: budget.recurring,
            categories: budget.categories,
        },
        spend: { totalMinor: spend.totalSpentMinor, byCategory },
        remaining: {
            totalMinor: remainingMinor,
            daysLeft,
            safeDailyMinor: remainingMinor != null && daysLeft > 0 ? Math.max(0, Math.floor(remainingMinor / daysLeft)) : null,
        },
        projection: budget.totalLimitMinor != null ? {
            projectedTotalMinor,
            willExceed: projectedTotalMinor > budget.totalLimitMinor,
            basis: 'current daily rate x days in period',
        } : null,
    };
};

export const getBudget = asyncHandler(async (req, res) => {
    const period = asString(req.query.period, { maxLength: 7 });
    const budget = await getBudgetForPeriod(req.user.id, period || null);
    if (!budget) return res.status(404).json({ message: 'No budget for this period' });
    res.status(200).json(await buildResponse(budget));
});

export const postBudget = asyncHandler(async (req, res) => {
    try {
        const budget = await createBudget(req.user.id, req.body || {});
        audit(AUDIT.BUDGET_CREATED, { userId: req.user.id, req, target: { type: 'Budget', id: String(budget._id) } });
        res.status(201).json(await buildResponse(budget));
    } catch (err) {
        if (err instanceof BudgetError) return res.status(err.status).json({ message: err.message });
        throw err;
    }
});

export const patchBudget = asyncHandler(async (req, res) => {
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'A valid budget id is required' });

    try {
        const budget = await updateBudget(req.user.id, id, req.body || {});
        audit(AUDIT.BUDGET_UPDATED, { userId: req.user.id, req, target: { type: 'Budget', id } });
        res.status(200).json(await buildResponse(budget));
    } catch (err) {
        if (err instanceof BudgetError) return res.status(err.status).json({ message: err.message });
        throw err;
    }
});

export const deleteBudget = asyncHandler(async (req, res) => {
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'A valid budget id is required' });

    try {
        await archiveBudget(req.user.id, id);
        audit(AUDIT.BUDGET_ARCHIVED, { userId: req.user.id, req, target: { type: 'Budget', id } });
        res.status(200).json({ message: 'Budget archived. Your transactions are not affected.' });
    } catch (err) {
        if (err instanceof BudgetError) return res.status(err.status).json({ message: err.message });
        throw err;
    }
});

export const getBudgetHistory = asyncHandler(async (req, res) => {
    const entries = await getHistory(req.user.id, {});
    res.status(200).json({
        entries: entries.map(({ budget, spend }) => ({
            period: budget.periodStart.toISOString().slice(0, 7),
            totalLimitMinor: budget.totalLimitMinor ?? null,
            totalSpentMinor: spend.totalSpentMinor,
        })),
    });
});

export const getBudgetSuggestions = asyncHandler(async (req, res) => {
    const suggestions = await getSuggestions(req.user.id);
    res.status(200).json({ suggestions });
});

export const postBudgetRollover = asyncHandler(async (req, res) => {
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'A valid budget id is required' });

    const next = await rollover(req.user.id, id);
    if (!next) return res.status(409).json({ message: 'Already rolled over, or nothing to roll over' });

    audit(AUDIT.BUDGET_ROLLED_OVER, { userId: req.user.id, req, target: { type: 'Budget', id: String(next._id) } });
    res.status(201).json(await buildResponse(next));
});
