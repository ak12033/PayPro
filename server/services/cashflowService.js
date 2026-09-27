import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import { categoryGroup, categoryKind } from '../constants/categories.js';
import { AMOUNT_MINOR_EXPR } from '../utils/money.js';
import { resolveRange, truncateDate, generateBuckets } from './analyticsQueryService.js';

/**
 * Cash-flow classification (plan.md §16.1).
 *
 * The central distinction this endpoint exists to draw: "money in" and
 * "income" are not the same number. A ₹5,000 top-up is money moving into the
 * wallet from the same person who owns it — not earnings — so it counts
 * toward `moneyInMinor` but never toward `incomeMinor`. `/analytics/overview`'s
 * existing `moneyIn` figure is intentionally untouched; this is the narrower,
 * additional figure plan.md asks for.
 *
 * Every response field here is integer paise (`*Minor`), and so is the
 * arithmetic: each row is projected as `AMOUNT_MINOR_EXPR` (plan.md §7.4
 * step 3), which falls back to `round(amount * 100)` for a row the backfill
 * has not reached, so an account with pre-Phase-2 history is never
 * under-counted.
 */
export const getCashflow = async (userId, { range = '6M' } = {}) => {
    const { unit, now, currentStart, previousStart } = resolveRange(range);
    const uid = new mongoose.Types.ObjectId(userId);

    const rows = await Transaction.aggregate([
        {
            $match: {
                userId: uid,
                status: 'SUCCESS',
                settlement: 'settled',
                postedAt: { $gte: previousStart, $lte: now },
            },
        },
        {
            $project: {
                type: 1,
                category: 1,
                amount: AMOUNT_MINOR_EXPR,
                postedAt: 1,
                isPrevious: { $lt: ['$postedAt', currentStart] },
            },
        },
    ]);

    const bucket = { income: 0, moneyIn: 0, expenses: 0, fixed: 0, variable: 0, savings: 0 };
    const prevBucket = { income: 0, expenses: 0 };
    const seriesMap = new Map();

    const seriesEntry = (postedAt) => {
        const key = truncateDate(postedAt, unit).toISOString();
        const entry = seriesMap.get(key) || { income: 0, expenses: 0 };
        seriesMap.set(key, entry);
        return entry;
    };

    for (const row of rows) {
        const kind = categoryKind(row.category);
        const target = row.isPrevious ? prevBucket : bucket;

        if (row.type === 'Credit') {
            if (!row.isPrevious) bucket.moneyIn += row.amount;
            if (kind === 'income' || kind === 'both') {
                target.income += row.amount;
                if (!row.isPrevious) seriesEntry(row.postedAt).income += row.amount;
            }
            continue;
        }

        // Debit. 'transfer' kind (Refund/Top Up/Stripe) never reaches a Debit
        // row in practice — kept as a defensive skip, not a load-bearing check.
        if (kind === 'transfer') continue;

        target.expenses += row.amount;
        if (!row.isPrevious) {
            const group = categoryGroup(row.category);
            if (group === 'fixed') bucket.fixed += row.amount;
            else if (group === 'savings') bucket.savings += row.amount;
            else bucket.variable += row.amount;
            seriesEntry(row.postedAt).expenses += row.amount;
        }
    }

    const series = generateBuckets(currentStart, now, unit).map((b) => {
        const key = b.toISOString();
        const entry = seriesMap.get(key) || { income: 0, expenses: 0 };
        return {
            period: key,
            incomeMinor: entry.income,
            expensesMinor: entry.expenses,
            netMinor: entry.income - entry.expenses,
        };
    });

    const net = bucket.income - bucket.expenses;
    const savingsRatePct = bucket.income > 0 ? Number(((net / bucket.income) * 100).toFixed(2)) : 0;

    const pctDelta = (curr, prev) => {
        if (!prev) return curr > 0 ? 100 : 0;
        return Number((((curr - prev) / prev) * 100).toFixed(2));
    };

    return {
        summary: {
            incomeMinor: bucket.income,
            moneyInMinor: bucket.moneyIn,
            expensesMinor: bucket.expenses,
            netMinor: net,
            savingsRatePct,
        },
        breakdown: {
            fixedMinor: bucket.fixed,
            variableMinor: bucket.variable,
            savingsMinor: bucket.savings,
        },
        series,
        comparison: {
            incomeDeltaPct: pctDelta(bucket.income, prevBucket.income),
            expensesDeltaPct: pctDelta(bucket.expenses, prevBucket.expenses),
        },
    };
};
