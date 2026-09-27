import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { asInt } from '../utils/sanitize.js';
import { getCashflow as computeCashflow } from '../services/cashflowService.js';
import { getFinancialHealth } from '../services/financialHealthService.js';
import { AMOUNT_MINOR_EXPR, fromPaise } from '../utils/money.js';
import {
    APP_TIMEZONE,
    resolveRange,
    truncateDate,
    generateBuckets,
    round2,
    getMerchantBreakdown as queryMerchantBreakdown,
    getTopExpenses as queryTopExpenses,
    getSpendingRhythm as querySpendingRhythm,
} from '../services/analyticsQueryService.js';

/** Only rows that really happened (or are on their way to) belong on a dashboard. */
const REPORTABLE_STATUSES = ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED'];

/**
 * Dashboard analytics.
 *
 * Every number here is derived from the real `Transaction`/`Payment` ledger —
 * there is no separate "analytics" data model. Credit rows are money in,
 * Debit rows are money out, and a Payment's `status` is what drives the
 * success-rate and pending/failed KPIs. Every query below is scoped to
 * `req.user.id`, the same way every other read in this codebase is.
 *
 * `resolveRange`/`truncateDate`/`generateBuckets`/`round2` moved to
 * `services/analyticsQueryService.js` (plan.md §17.2) so budgets, cash flow,
 * merchants, top-expenses and deterministic insights bucket time identically
 * instead of each re-deriving "what is a week" — behaviour here is unchanged.
 */

export const getOverview = asyncHandler(async (req, res) => {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const { unit, now, currentStart, previousStart } = resolveRange(req.query.range);

    const [result] = await Transaction.aggregate([
        { $match: { userId, status: { $in: REPORTABLE_STATUSES }, createdAt: { $gte: previousStart, $lte: now } } },
        {
            $facet: {
                currentSeries: [
                    { $match: { createdAt: { $gte: currentStart } } },
                    {
                        $group: {
                            _id: {
                                date: { $dateTrunc: { date: '$createdAt', unit, timezone: APP_TIMEZONE } },
                                type: '$type',
                            },
                            total: { $sum: AMOUNT_MINOR_EXPR },
                        },
                    },
                ],
                currentTotals: [
                    { $match: { createdAt: { $gte: currentStart } } },
                    { $group: { _id: '$type', total: { $sum: AMOUNT_MINOR_EXPR }, count: { $sum: 1 } } },
                ],
                previousTotals: [
                    { $match: { createdAt: { $lt: currentStart } } },
                    { $group: { _id: '$type', total: { $sum: AMOUNT_MINOR_EXPR } } },
                ],
            },
        },
    ]);

    const sumByType = (rows, type) => rows.find((r) => r._id === type)?.total || 0;
    const countAll = (rows) => rows.reduce((sum, r) => sum + r.count, 0);

    const moneyIn = sumByType(result.currentTotals, 'Credit');
    const moneyOut = sumByType(result.currentTotals, 'Debit');
    const netCashFlow = moneyIn - moneyOut;
    const transactionCount = countAll(result.currentTotals);

    const prevMoneyIn = sumByType(result.previousTotals, 'Credit');
    const prevMoneyOut = sumByType(result.previousTotals, 'Debit');
    const prevNet = prevMoneyIn - prevMoneyOut;

    const growthPct = prevNet !== 0
        ? round2(((netCashFlow - prevNet) / Math.abs(prevNet)) * 100)
        : (netCashFlow !== 0 ? 100 : 0);

    const seriesMap = new Map();
    for (const row of result.currentSeries) {
        const key = row._id.date.toISOString();
        const entry = seriesMap.get(key) || { moneyIn: 0, moneyOut: 0 };
        if (row._id.type === 'Credit') entry.moneyIn = row.total;
        else entry.moneyOut = row.total;
        seriesMap.set(key, entry);
    }

    const series = generateBuckets(currentStart, now, unit).map((bucket) => {
        const key = bucket.toISOString();
        const entry = seriesMap.get(key) || { moneyIn: 0, moneyOut: 0 };
        return {
            date: key,
            moneyIn: fromPaise(entry.moneyIn),
            moneyOut: fromPaise(entry.moneyOut),
            net: fromPaise(entry.moneyIn - entry.moneyOut),
        };
    });

    const [pendingPayments, failedPayments] = await Promise.all([
        Payment.countDocuments({ userId, status: 'created', createdAt: { $gte: currentStart, $lte: now } }),
        Payment.countDocuments({ userId, status: 'failed', createdAt: { $gte: currentStart, $lte: now } }),
    ]);

    res.status(200).json({
        summary: {
            moneyIn: fromPaise(moneyIn),
            moneyOut: fromPaise(moneyOut),
            netCashFlow: fromPaise(netCashFlow),
            transactionCount,
            growthPct,
            pendingPayments,
            failedPayments,
        },
        series,
    });
});

/** Categories a user may not have picked by hand still fall through to this list via AI categorisation — see MANUAL_CATEGORIES in transactionController.js. */
export const getCategoryBreakdown = asyncHandler(async (req, res) => {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const { now, currentStart, previousStart } = resolveRange(req.query.range);

    const [result] = await Transaction.aggregate([
        { $match: { userId, type: 'Debit', status: 'SUCCESS', createdAt: { $gte: previousStart, $lte: now } } },
        {
            $facet: {
                current: [
                    { $match: { createdAt: { $gte: currentStart } } },
                    { $group: { _id: '$category', amount: { $sum: AMOUNT_MINOR_EXPR }, count: { $sum: 1 } } },
                    { $sort: { amount: -1 } },
                ],
                previous: [
                    { $match: { createdAt: { $lt: currentStart } } },
                    { $group: { _id: '$category', amount: { $sum: AMOUNT_MINOR_EXPR } } },
                ],
            },
        },
    ]);

    const previousMap = new Map(result.previous.map((r) => [r._id, r.amount]));
    const totalAmount = result.current.reduce((sum, r) => sum + r.amount, 0);

    // 5, not 6: the dashboard donut has exactly 5 CVD-validated categorical
    // colours (see tokens.css) plus a neutral "Other" — a 6th real category
    // would force a colour re-validation, not just a bigger loop bound.
    const TOP_N = 5;
    const top = result.current.slice(0, TOP_N);
    const rest = result.current.slice(TOP_N);

    const trendFor = (category, amount) => {
        const prev = previousMap.get(category) || 0;
        if (!prev) return amount > 0 ? 100 : 0;
        return round2(((amount - prev) / prev) * 100);
    };

    const items = top.map((r) => ({
        category: r._id || 'Others',
        amount: fromPaise(r.amount),
        count: r.count,
        percent: totalAmount ? round2((r.amount / totalAmount) * 100) : 0,
        trendPct: trendFor(r._id, r.amount),
    }));

    const restAmount = rest.reduce((sum, r) => sum + r.amount, 0);
    if (restAmount > 0) {
        items.push({
            category: 'Other',
            amount: fromPaise(restAmount),
            count: rest.reduce((sum, r) => sum + r.count, 0),
            percent: totalAmount ? round2((restAmount / totalAmount) * 100) : 0,
            trendPct: null,
        });
    }

    res.status(200).json({ items, totalAmount: fromPaise(totalAmount) });
});

/**
 * "Network growth" — the closest real, decision-useful analogue to a B2B
 * user-growth chart this product's data supports: how many distinct people
 * this wallet has transferred to, and whether that's still growing.
 */
export const getNetworkGrowth = asyncHandler(async (req, res) => {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const { unit, now, currentStart } = resolveRange(req.query.range);

    // Unbounded on purpose: a recipient's *first-ever* contact date can fall
    // well before the selected range, and the cumulative total needs it.
    const contacts = await Transaction.aggregate([
        { $match: { userId, type: 'Debit', category: 'Transfer', recipientId: { $ne: null } } },
        {
            $group: {
                _id: '$recipientId',
                firstDate: { $min: '$createdAt' },
                totalSent: { $sum: AMOUNT_MINOR_EXPR },
                count: { $sum: 1 },
            },
        },
    ]);

    const baselineCumulative = contacts.filter((c) => c.firstDate < currentStart).length;

    const newByBucket = new Map();
    for (const c of contacts) {
        if (c.firstDate < currentStart) continue;
        const key = truncateDate(c.firstDate, unit).toISOString();
        newByBucket.set(key, (newByBucket.get(key) || 0) + 1);
    }

    let cumulative = baselineCumulative;
    const series = generateBuckets(currentStart, now, unit).map((bucket) => {
        const key = bucket.toISOString();
        const newRecipients = newByBucket.get(key) || 0;
        cumulative += newRecipients;
        return { date: key, newRecipients, cumulative };
    });

    const topContacts = [...contacts].sort((a, b) => b.totalSent - a.totalSent).slice(0, 5);
    const users = await User.find({ _id: { $in: topContacts.map((c) => c._id) } })
        .select('firstName lastName')
        .lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    const topRecipients = topContacts.map((c) => {
        const user = userMap.get(String(c._id));
        return {
            recipientId: String(c._id),
            name: user ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Unknown',
            totalSent: fromPaise(c.totalSent),
            count: c.count,
        };
    });

    res.status(200).json({ series, topRecipients, totalNetwork: contacts.length });
});

export const getPaymentsStatus = asyncHandler(async (req, res) => {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const { unit, now, currentStart, previousStart } = resolveRange(req.query.range);

    const [result] = await Payment.aggregate([
        { $match: { userId, createdAt: { $gte: previousStart, $lte: now } } },
        {
            $facet: {
                currentByStatus: [
                    { $match: { createdAt: { $gte: currentStart } } },
                    { $group: { _id: '$status', count: { $sum: 1 } } },
                ],
                previousByStatus: [
                    { $match: { createdAt: { $lt: currentStart } } },
                    { $group: { _id: '$status', count: { $sum: 1 } } },
                ],
                dailySeries: [
                    { $match: { createdAt: { $gte: currentStart } } },
                    {
                        $group: {
                            _id: {
                                date: { $dateTrunc: { date: '$createdAt', unit, timezone: APP_TIMEZONE } },
                                status: '$status',
                            },
                            count: { $sum: 1 },
                        },
                    },
                ],
            },
        },
    ]);

    const countOf = (rows, status) => rows.find((r) => r._id === status)?.count || 0;

    const captured = countOf(result.currentByStatus, 'captured');
    const failed = countOf(result.currentByStatus, 'failed');
    const pending = countOf(result.currentByStatus, 'created');
    const refunded = countOf(result.currentByStatus, 'refunded');
    const decided = captured + failed;
    const successRate = decided ? round2((captured / decided) * 100) : (captured > 0 ? 100 : 0);

    const prevCaptured = countOf(result.previousByStatus, 'captured');
    const prevFailed = countOf(result.previousByStatus, 'failed');
    const prevDecided = prevCaptured + prevFailed;
    const prevSuccessRate = prevDecided ? (prevCaptured / prevDecided) * 100 : null;
    const successRateChangePct = prevSuccessRate !== null ? round2(successRate - prevSuccessRate) : null;

    const seriesMap = new Map();
    for (const row of result.dailySeries) {
        const key = row._id.date.toISOString();
        const entry = seriesMap.get(key) || { captured: 0, failed: 0 };
        if (row._id.status === 'captured') entry.captured = row.count;
        else if (row._id.status === 'failed') entry.failed = row.count;
        seriesMap.set(key, entry);
    }

    const series = generateBuckets(currentStart, now, unit).map((bucket) => {
        const key = bucket.toISOString();
        const entry = seriesMap.get(key) || { captured: 0, failed: 0 };
        const total = entry.captured + entry.failed;
        return { date: key, successRate: total ? round2((entry.captured / total) * 100) : null };
    });

    res.status(200).json({
        summary: { captured, failed, pending, refunded, successRate, successRateChangePct },
        series,
    });
});

/** Cash flow — income vs expenses, distinct from "money in vs money out" above (plan.md §16). */
export const getCashflow = asyncHandler(async (req, res) => {
    const result = await computeCashflow(req.user.id, { range: req.query.range });
    res.status(200).json(result);
});

/** Spend grouped by merchant/counterparty (plan.md §17.2). */
export const getMerchantBreakdown = asyncHandler(async (req, res) => {
    const limit = asInt(req.query.limit, { min: 1, max: 25, fallback: 10 });
    const merchants = await queryMerchantBreakdown(req.user.id, { range: req.query.range, limit });
    res.status(200).json({ merchants });
});

/** The largest individual debits in a range (plan.md §17.2). */
export const getTopExpenses = asyncHandler(async (req, res) => {
    const limit = asInt(req.query.limit, { min: 1, max: 25, fallback: 10 });
    const transactions = await queryTopExpenses(req.user.id, { range: req.query.range, limit });
    res.status(200).json({ transactions });
});

/** Weekday × hour spending grid (plan.md §17.2). */
export const getSpendingRhythm = asyncHandler(async (req, res) => {
    res.status(200).json(await querySpendingRhythm(req.user.id, { range: req.query.range }));
});

/**
 * Financial health (plan.md §25).
 *
 * The response carries its own disclaimer rather than leaving the client to
 * remember one: §25.2 requires "not a credit score" to be rendered adjacent to
 * the score, and a string the API always returns is harder to drop than a
 * constant someone has to remember to import.
 */
export const getFinancialHealthScore = asyncHandler(async (req, res) => {
    res.status(200).json(await getFinancialHealth(req.user.id));
});
