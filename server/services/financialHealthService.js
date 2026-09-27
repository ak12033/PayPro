import mongoose from 'mongoose';
import Goal from '../models/Goal.js';
import Budget from '../models/Budget.js';
import Transaction from '../models/Transaction.js';
import { computeSpend } from './budgetService.js';
import { startOfMonthIST, endOfMonthIST, monthKeyIST } from '../utils/period.js';
import { categoryGroup, categoryKind } from '../constants/categories.js';
import { AMOUNT_MINOR_EXPR } from '../utils/money.js';

/**
 * Financial health (plan.md §25).
 *
 * Five deterministic components, weighted. The rule that shapes everything
 * here is §25.1's last line: **never invent a score from missing data.** A user
 * with no budget has no budget-adherence score — not a zero, not a default of
 * 50. The component is marked `insufficient_data`, dropped from the weighted
 * average, and the UI is told what would unlock it.
 *
 * That has a consequence worth stating plainly: the denominator is the sum of
 * *available* weights, not 100. A user with only two components scored is
 * measured on those two. The alternative — treating missing data as a bad
 * result — would tell a brand-new user their finances are in poor shape when
 * the truth is that we do not know yet.
 *
 * It is not a credit score. §25.2 requires that disclaimer on the same screen,
 * and `DISCLAIMER` below is returned by the API so the client cannot forget it.
 */

export const DISCLAIMER =
    "This is PayPro's own measure of how your money is tracking. It is not a credit score and is not used by any lender.";

export const COMPONENT_STATUS = {
    SCORED: 'scored',
    INSUFFICIENT_DATA: 'insufficient_data',
};

/** Weights from §25.1's table. They sum to 100 when every component is available. */
export const WEIGHTS = {
    savingsRate: 25,
    budgetAdherence: 20,
    emergencyFund: 20,
    cashflowStability: 20,
    spendingDiscipline: 15,
};

const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const round = (n) => Math.round(n * 10) / 10;

const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

const insufficient = (key, label, weight, explanation) => ({
    key, label, weight, score: null, status: COMPONENT_STATUS.INSUFFICIENT_DATA, explanation,
});

/** Month anchors, newest last: `[n months ago, ..., this month]`. */
const monthAnchors = (now, count) => {
    const anchors = [];
    for (let i = count - 1; i >= 0; i -= 1) {
        const anchor = new Date(now);
        // Snap to mid-month before shifting: `setMonth` on the 31st of a month
        // followed by a shift into a 30-day month rolls into the *next* month,
        // which would silently drop or duplicate a bucket.
        anchor.setDate(15);
        anchor.setMonth(anchor.getMonth() - i);
        anchors.push(anchor);
    }
    return anchors;
};

/**
 * Income and expenses per IST calendar month.
 *
 * Computed here rather than borrowed from `cashflowService`: §25 is written in
 * months throughout ("3-month average", "over 6 months"), and `getCashflow`'s
 * '6M' range buckets by *week*. Reusing it would have quietly measured the last
 * three weeks wherever this code says three months. The income/expense
 * classification below is deliberately the same `categoryKind` rule cash flow
 * uses, so the two features never disagree about what counts as income.
 */
const monthlyTotals = async (userId, now, count) => {
    const anchors = monthAnchors(now, count);
    const start = startOfMonthIST(anchors[0]);
    const end = endOfMonthIST(anchors[anchors.length - 1]);

    const rows = await Transaction.aggregate([
        {
            $match: {
                userId: new mongoose.Types.ObjectId(userId),
                status: 'SUCCESS',
                settlement: 'settled',
                postedAt: { $gte: start, $lt: end },
            },
        },
        { $project: { type: 1, category: 1, amount: AMOUNT_MINOR_EXPR, postedAt: 1 } },
    ]);

    const buckets = new Map(
        anchors.map((anchor) => [
            startOfMonthIST(anchor).toISOString(),
            { period: startOfMonthIST(anchor), income: 0, expenses: 0 },
        ])
    );

    for (const row of rows) {
        const bucket = buckets.get(startOfMonthIST(new Date(row.postedAt)).toISOString());
        if (!bucket) continue;

        const kind = categoryKind(row.category);
        if (row.type === 'Credit') {
            // A top-up is money in, not income — the same distinction §16.1 draws.
            if (kind === 'income' || kind === 'both') bucket.income += row.amount;
        } else if (kind !== 'transfer') {
            bucket.expenses += row.amount;
        }
    }

    return [...buckets.values()].map((b) => ({
        period: b.period,
        incomeMinor: b.income,
        expensesMinor: b.expenses,
        netMinor: b.income - b.expenses,
    }));
};

/**
 * Savings rate: `(income - expenses) / income`, averaged over 3 months.
 * 0% scores 0, >= 30% scores 100, linear between (§25.1).
 *
 * Only months with actual income count. A month with none is not a 0% savings
 * rate — it is a month this measure says nothing about, and averaging a zero in
 * would punish a freelancer paid quarterly for the two months they were not.
 */
const scoreSavingsRate = (months) => {
    const withIncome = months.filter((m) => m.incomeMinor > 0);
    if (withIncome.length < 2) {
        return insufficient(
            'savingsRate', 'Savings rate', WEIGHTS.savingsRate,
            'Record at least two months of income to see this.'
        );
    }

    const rates = withIncome.map((m) => (m.incomeMinor - m.expensesMinor) / m.incomeMinor);
    const avg = mean(rates);
    const score = clamp((avg / 0.3) * 100);

    return {
        key: 'savingsRate', label: 'Savings rate', weight: WEIGHTS.savingsRate,
        score: round(score), status: COMPONENT_STATUS.SCORED,
        explanation: `You kept ${Math.round(avg * 100)}% of what you earned over the last ${withIncome.length} months. 30% or more scores full marks.`,
    };
};

/**
 * Budget adherence: the share of budgeted categories that stayed within their
 * limit, across the last 3 periods (§25.1).
 */
const scoreBudgetAdherence = async (userId, now) => {
    const anchors = monthAnchors(now, 3);
    const periods = [];

    for (const anchor of anchors) {
        const start = startOfMonthIST(anchor);
        const end = endOfMonthIST(anchor);
        const budget = await Budget.findOne({ userId, periodStart: start, archivedAt: null }).lean();
        if (!budget?.categories?.length) continue;

        const spend = await computeSpend(userId, start, end);
        const within = budget.categories.filter((c) => {
            const spent = spend.byCategory.find((s) => s.category === c.category)?.spentMinor ?? 0;
            return spent <= c.limitMinor;
        }).length;

        periods.push({ within, total: budget.categories.length });
    }

    if (!periods.length) {
        return insufficient(
            'budgetAdherence', 'Budget adherence', WEIGHTS.budgetAdherence,
            'Set a monthly budget with category limits to see this.'
        );
    }

    const totalCategories = periods.reduce((sum, p) => sum + p.total, 0);
    const totalWithin = periods.reduce((sum, p) => sum + p.within, 0);
    const score = (totalWithin / totalCategories) * 100;

    return {
        key: 'budgetAdherence', label: 'Budget adherence', weight: WEIGHTS.budgetAdherence,
        score: round(score), status: COMPONENT_STATUS.SCORED,
        explanation: `${totalWithin} of ${totalCategories} category limits held over ${periods.length} month(s).`,
    };
};

/**
 * Emergency fund: an active `emergency` goal's current value against 3x
 * monthly expenses (§25.1), as a ratio capped at 100.
 */
const scoreEmergencyFund = async (userId, months) => {
    const goal = await Goal.findOne({ userId, type: 'emergency', status: 'active' })
        .sort({ createdAt: -1 }).lean();

    if (!goal) {
        return insufficient(
            'emergencyFund', 'Emergency fund', WEIGHTS.emergencyFund,
            'Create an emergency-fund goal to see this.'
        );
    }

    const expenseMonths = months.filter((m) => m.expensesMinor > 0);
    if (!expenseMonths.length) {
        return insufficient(
            'emergencyFund', 'Emergency fund', WEIGHTS.emergencyFund,
            'Not enough spending history to work out what three months costs you.'
        );
    }

    const target = mean(expenseMonths.map((m) => m.expensesMinor)) * 3;
    const score = clamp((goal.currentMinor / target) * 100);

    return {
        key: 'emergencyFund', label: 'Emergency fund', weight: WEIGHTS.emergencyFund,
        score: round(score), status: COMPONENT_STATUS.SCORED,
        explanation: `Your emergency goal covers ${Math.round((goal.currentMinor / target) * 100)}% of three months' spending. Remember this is tracked, not locked away.`,
    };
};

/**
 * Cash-flow stability: coefficient of variation of monthly net over 6 months,
 * low CV scoring high (§25.1).
 *
 * CV is computed against the mean of the *absolute* net so a user whose net
 * hovers around zero doesn't divide by almost nothing and score as infinitely
 * unstable — a near-zero net that is consistently near zero is stable, and the
 * arithmetic has to agree.
 */
const scoreCashflowStability = (months) => {
    const nets = months.map((m) => m.netMinor);
    if (nets.length < 3) {
        return insufficient(
            'cashflowStability', 'Cash-flow stability', WEIGHTS.cashflowStability,
            'Three months of activity are needed to measure this.'
        );
    }

    const avgAbs = mean(nets.map(Math.abs));
    if (avgAbs === 0) {
        return insufficient(
            'cashflowStability', 'Cash-flow stability', WEIGHTS.cashflowStability,
            'No money moved in this period.'
        );
    }

    const m = mean(nets);
    const sd = Math.sqrt(mean(nets.map((n) => (n - m) ** 2)));
    const cv = sd / avgAbs;

    // CV of 0 scores 100, CV of 1 or more scores 0.
    const score = clamp((1 - cv) * 100);

    return {
        key: 'cashflowStability', label: 'Cash-flow stability', weight: WEIGHTS.cashflowStability,
        score: round(score), status: COMPONENT_STATUS.SCORED,
        explanation: cv < 0.3
            ? 'Your month-to-month balance is steady.'
            : 'Your monthly net swings around a fair amount, which makes planning harder.',
    };
};

/**
 * Spending discipline: the share of spend in `fixed` + `savings` groups versus
 * `lifestyle`, banded (§25.1).
 */
const scoreSpendingDiscipline = (byCategory) => {
    let disciplined = 0;
    let lifestyle = 0;
    let total = 0;

    for (const { category, spentMinor } of byCategory) {
        const group = categoryGroup(category);
        total += spentMinor;
        if (group === 'fixed' || group === 'savings') disciplined += spentMinor;
        else if (group === 'lifestyle') lifestyle += spentMinor;
    }

    if (total === 0) {
        return insufficient(
            'spendingDiscipline', 'Spending mix', WEIGHTS.spendingDiscipline,
            'No categorised spending in the last three months.'
        );
    }

    const disciplinedShare = disciplined / total;
    const lifestyleShare = lifestyle / total;

    /**
     * Bands, not a formula. §25.1 says "banded" and does not say where — these
     * edges are a reasonable first cut, not a calibrated finding, and they are
     * here in one place so they can be moved when there is evidence.
     */
    let score;
    if (lifestyleShare <= 0.15) score = 100;
    else if (lifestyleShare <= 0.25) score = 85;
    else if (lifestyleShare <= 0.4) score = 65;
    else if (lifestyleShare <= 0.55) score = 40;
    else score = 20;

    return {
        key: 'spendingDiscipline', label: 'Spending mix', weight: WEIGHTS.spendingDiscipline,
        score: round(score), status: COMPONENT_STATUS.SCORED,
        explanation: `${Math.round(lifestyleShare * 100)}% of your spending is discretionary; ${Math.round(disciplinedShare * 100)}% is commitments and saving.`,
    };
};

const bandFor = (score) => {
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'fair';
    return 'needs_attention';
};

/**
 * Recommendations, drawn from whichever components scored worst or are missing.
 * Bounded to three: a list of five things to fix is a list nobody acts on.
 */
const buildRecommendations = (components) => {
    const missing = components
        .filter((c) => c.status === COMPONENT_STATUS.INSUFFICIENT_DATA)
        .map((c) => ({ key: c.key, label: `Unlock ${c.label.toLowerCase()}`, detail: c.explanation }));

    const weak = components
        .filter((c) => c.status === COMPONENT_STATUS.SCORED && c.score < 50)
        .sort((a, b) => a.score - b.score)
        .map((c) => ({ key: c.key, label: `Improve ${c.label.toLowerCase()}`, detail: c.explanation }));

    return [...missing, ...weak].slice(0, 3);
};

/**
 * The whole score for one user.
 *
 * `trend` is the 6-month history of the *savings-rate-and-stability* pair only
 * — the two components computable retrospectively from the ledger alone.
 * Budget adherence and the emergency fund depend on documents whose historical
 * state is not versioned, so a "score in March" cannot be reconstructed
 * honestly and this does not pretend to.
 */
export const getFinancialHealth = async (userId, { now = new Date() } = {}) => {
    const months = await monthlyTotals(userId, now, 6);
    const recent = months.slice(-3);

    const threeMonthStart = startOfMonthIST(monthAnchors(now, 3)[0]);
    const spend = await computeSpend(userId, threeMonthStart, endOfMonthIST(now));

    const components = [
        scoreSavingsRate(recent),
        await scoreBudgetAdherence(userId, now),
        await scoreEmergencyFund(userId, recent),
        scoreCashflowStability(months),
        scoreSpendingDiscipline(spend.byCategory),
    ];

    const scored = components.filter((c) => c.status === COMPONENT_STATUS.SCORED);
    const availableWeight = scored.reduce((sum, c) => sum + c.weight, 0);

    const score = availableWeight > 0
        ? Math.round(scored.reduce((sum, c) => sum + c.score * c.weight, 0) / availableWeight)
        : null;

    return {
        score,
        band: score === null ? null : bandFor(score),
        /** How much of the full 100 points of weight this score is based on. */
        coverage: Math.round((availableWeight / 100) * 100),
        components,
        trend: months.map((m) => ({
            period: monthKeyIST(new Date(m.period)),
            netMinor: m.netMinor,
            savingsRate: m.incomeMinor > 0
                ? Math.round(((m.incomeMinor - m.expensesMinor) / m.incomeMinor) * 100)
                : null,
        })),
        recommendations: buildRecommendations(components),
        disclaimer: DISCLAIMER,
    };
};

export default { getFinancialHealth, DISCLAIMER, WEIGHTS, COMPONENT_STATUS };
