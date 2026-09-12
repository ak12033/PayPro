import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';
import { asEnum } from '../utils/sanitize.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Dashboard analytics.
 *
 * Every number here is derived from the real `Transaction`/`Payment` ledger —
 * there is no separate "analytics" data model. Credit rows are money in,
 * Debit rows are money out, and a Payment's `status` is what drives the
 * success-rate and pending/failed KPIs. Every query below is scoped to
 * `req.user.id`, the same way every other read in this codebase is.
 */

const RANGE_CONFIG = {
    '1D': { days: 1, unit: 'hour' },
    '7D': { days: 7, unit: 'day' },
    '1M': { days: 30, unit: 'day' },
    '3M': { days: 90, unit: 'week' },
    '6M': { days: 180, unit: 'week' },
    '1Y': { days: 365, unit: 'month' },
};
const RANGE_KEYS = Object.keys(RANGE_CONFIG);
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Current period + the immediately preceding period of equal length, so
 * "growth vs previous period" always compares like-for-like.
 */
const resolveRange = (rangeParam) => {
    const range = asEnum(rangeParam, RANGE_KEYS, '1M');
    const { days, unit } = RANGE_CONFIG[range];
    const now = new Date();
    const currentStart = new Date(now.getTime() - days * DAY_MS);
    const previousStart = new Date(currentStart.getTime() - days * DAY_MS);
    return { range, unit, now, currentStart, previousStart };
};

/**
 * JS mirror of Mongo's `$dateTrunc` (UTC, binSize 1, default Sunday week
 * start) so bucket keys computed here always match bucket keys computed in
 * an aggregation pipeline.
 */
const truncateDate = (value, unit) => {
    const d = new Date(value);
    switch (unit) {
        case 'hour':
            d.setUTCMinutes(0, 0, 0);
            return d;
        case 'week': {
            d.setUTCHours(0, 0, 0, 0);
            d.setUTCDate(d.getUTCDate() - d.getUTCDay());
            return d;
        }
        case 'month':
            d.setUTCHours(0, 0, 0, 0);
            d.setUTCDate(1);
            return d;
        case 'day':
        default:
            d.setUTCHours(0, 0, 0, 0);
            return d;
    }
};

const stepDate = (value, unit) => {
    const d = new Date(value);
    switch (unit) {
        case 'hour': d.setUTCHours(d.getUTCHours() + 1); return d;
        case 'week': d.setUTCDate(d.getUTCDate() + 7); return d;
        case 'month': d.setUTCMonth(d.getUTCMonth() + 1); return d;
        case 'day':
        default: d.setUTCDate(d.getUTCDate() + 1); return d;
    }
};

/** Every bucket boundary between `start` and `end`, inclusive — fills gaps so a quiet day still renders as a zero point instead of a hole in the line. */
const generateBuckets = (start, end, unit) => {
    const buckets = [];
    let cursor = truncateDate(start, unit);
    const last = truncateDate(end, unit);
    while (cursor <= last) {
        buckets.push(new Date(cursor));
        cursor = stepDate(cursor, unit);
    }
    return buckets;
};

const round2 = (value) => Number((value || 0).toFixed(2));

export const getOverview = asyncHandler(async (req, res) => {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const { unit, now, currentStart, previousStart } = resolveRange(req.query.range);

    const [result] = await Transaction.aggregate([
        { $match: { userId, createdAt: { $gte: previousStart, $lte: now } } },
        {
            $facet: {
                currentSeries: [
                    { $match: { createdAt: { $gte: currentStart } } },
                    {
                        $group: {
                            _id: {
                                date: { $dateTrunc: { date: '$createdAt', unit, timezone: 'UTC' } },
                                type: '$type',
                            },
                            total: { $sum: '$amount' },
                        },
                    },
                ],
                currentTotals: [
                    { $match: { createdAt: { $gte: currentStart } } },
                    { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } },
                ],
                previousTotals: [
                    { $match: { createdAt: { $lt: currentStart } } },
                    { $group: { _id: '$type', total: { $sum: '$amount' } } },
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
            moneyIn: round2(entry.moneyIn),
            moneyOut: round2(entry.moneyOut),
            net: round2(entry.moneyIn - entry.moneyOut),
        };
    });

    const [pendingPayments, failedPayments] = await Promise.all([
        Payment.countDocuments({ userId, status: 'created', createdAt: { $gte: currentStart, $lte: now } }),
        Payment.countDocuments({ userId, status: 'failed', createdAt: { $gte: currentStart, $lte: now } }),
    ]);

    res.status(200).json({
        summary: {
            moneyIn: round2(moneyIn),
            moneyOut: round2(moneyOut),
            netCashFlow: round2(netCashFlow),
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
        { $match: { userId, type: 'Debit', createdAt: { $gte: previousStart, $lte: now } } },
        {
            $facet: {
                current: [
                    { $match: { createdAt: { $gte: currentStart } } },
                    { $group: { _id: '$category', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
                    { $sort: { amount: -1 } },
                ],
                previous: [
                    { $match: { createdAt: { $lt: currentStart } } },
                    { $group: { _id: '$category', amount: { $sum: '$amount' } } },
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
        amount: round2(r.amount),
        count: r.count,
        percent: totalAmount ? round2((r.amount / totalAmount) * 100) : 0,
        trendPct: trendFor(r._id, r.amount),
    }));

    const restAmount = rest.reduce((sum, r) => sum + r.amount, 0);
    if (restAmount > 0) {
        items.push({
            category: 'Other',
            amount: round2(restAmount),
            count: rest.reduce((sum, r) => sum + r.count, 0),
            percent: totalAmount ? round2((restAmount / totalAmount) * 100) : 0,
            trendPct: null,
        });
    }

    res.status(200).json({ items, totalAmount: round2(totalAmount) });
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
                totalSent: { $sum: '$amount' },
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
            totalSent: round2(c.totalSent),
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
                                date: { $dateTrunc: { date: '$createdAt', unit, timezone: 'UTC' } },
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
