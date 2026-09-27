import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import { asEnum } from '../utils/sanitize.js';
import { APP_TIMEZONE } from '../utils/period.js';
import { SETTLED_STATUSES } from '../constants/transactionStatus.js';
import { EXCLUDED_FROM_BUDGET } from '../constants/categories.js';
import { AMOUNT_MINOR_EXPR, fromPaise } from '../utils/money.js';

/**
 * Shared IST-aware bucketing + range resolution, extracted out of
 * `analyticsController.js` (plan.md §17.2's last gap row) so cash flow,
 * merchants, top-expenses and the deterministic insights all bucket time the
 * same way `getOverview`/`getCategoryBreakdown` already do, instead of each
 * re-deriving it. Behaviour is unchanged from the controller's original
 * implementation — this is a lift, not a rewrite.
 */

export const RANGE_CONFIG = {
    '1D': { days: 1, unit: 'hour' },
    '7D': { days: 7, unit: 'day' },
    '1M': { days: 30, unit: 'day' },
    '3M': { days: 90, unit: 'week' },
    '6M': { days: 180, unit: 'week' },
    '1Y': { days: 365, unit: 'month' },
};
export const RANGE_KEYS = Object.keys(RANGE_CONFIG);
const DAY_MS = 24 * 60 * 60 * 1000;

export const resolveRange = (rangeParam) => {
    const range = asEnum(rangeParam, RANGE_KEYS, '1M');
    const { days, unit } = RANGE_CONFIG[range];
    const now = new Date();
    const currentStart = new Date(now.getTime() - days * DAY_MS);
    const previousStart = new Date(currentStart.getTime() - days * DAY_MS);
    return { range, unit, now, currentStart, previousStart };
};

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const toShifted = (d) => new Date(d.getTime() + IST_OFFSET_MS);
const fromShifted = (d) => new Date(d.getTime() - IST_OFFSET_MS);

export const truncateDate = (value, unit) => {
    const d = toShifted(new Date(value));
    switch (unit) {
        case 'hour':
            d.setUTCMinutes(0, 0, 0);
            break;
        case 'week':
            d.setUTCHours(0, 0, 0, 0);
            d.setUTCDate(d.getUTCDate() - d.getUTCDay());
            break;
        case 'month':
            d.setUTCHours(0, 0, 0, 0);
            d.setUTCDate(1);
            break;
        case 'day':
        default:
            d.setUTCHours(0, 0, 0, 0);
    }
    return fromShifted(d);
};

export const stepDate = (value, unit) => {
    const d = toShifted(new Date(value));
    switch (unit) {
        case 'hour': d.setUTCHours(d.getUTCHours() + 1); break;
        case 'week': d.setUTCDate(d.getUTCDate() + 7); break;
        case 'month': d.setUTCMonth(d.getUTCMonth() + 1); break;
        case 'day':
        default: d.setUTCDate(d.getUTCDate() + 1);
    }
    return fromShifted(d);
};

export const generateBuckets = (start, end, unit) => {
    const buckets = [];
    let cursor = truncateDate(start, unit);
    const last = truncateDate(end, unit);
    while (cursor <= last) {
        buckets.push(new Date(cursor));
        cursor = stepDate(cursor, unit);
    }
    return buckets;
};

export const round2 = (value) => Number((value || 0).toFixed(2));

/**
 * Ranked spend by counterparty name for a range (plan.md §17.2 — new
 * merchant/counterparty analytics). Only rows with a recorded counterparty
 * name participate; a P2P transfer's counterparty is a person, not a
 * merchant, and `Transaction.counterparty` is `undefined` for most historical
 * rows written before Phase 1's counterparty field existed — both are
 * correctly excluded rather than surfaced as a mysterious blank row.
 */
export const getMerchantBreakdown = async (userId, { range = '1M', limit = 10 } = {}) => {
    const { now, currentStart } = resolveRange(range);

    const rows = await Transaction.aggregate([
        {
            $match: {
                userId: new mongoose.Types.ObjectId(userId),
                type: 'Debit',
                status: 'SUCCESS',
                'counterparty.name': { $exists: true, $ne: null },
                'counterparty.kind': { $in: ['merchant', 'external'] },
                postedAt: { $gte: currentStart, $lte: now },
            },
        },
        {
            $group: {
                _id: '$counterparty.name',
                amount: { $sum: AMOUNT_MINOR_EXPR },
                count: { $sum: 1 },
                lastPostedAt: { $max: '$postedAt' },
            },
        },
        { $sort: { amount: -1 } },
        { $limit: limit },
    ]);

    return rows.map((r) => ({
        merchant: r._id,
        amount: fromPaise(r.amount),
        amountMinor: r.amount,
        count: r.count,
        lastPostedAt: r.lastPostedAt,
    }));
};

/** The largest individual debits in a range (plan.md §17.2). */
export const getTopExpenses = async (userId, { range = '1M', limit = 10 } = {}) => {
    const { now, currentStart } = resolveRange(range);

    const rows = await Transaction.find({
        userId,
        type: 'Debit',
        status: 'SUCCESS',
        postedAt: { $gte: currentStart, $lte: now },
    })
        .sort({ amount: -1 })
        .limit(limit)
        .select('description category amount amountMinor postedAt counterparty')
        .lean();

    return rows;
};

/** Monday-first, matching $isoDayOfWeek (1 = Monday … 7 = Sunday). */
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const RHYTHM_RANGES = ['1M', '3M', '6M', '1Y'];

/**
 * When in the week money goes out (plan.md §17.2, the day/hour heatmap).
 *
 * A dense 7 × 24 grid in `APP_TIMEZONE`, so the client never has to guess
 * which empty cells are "no data" and which are "not returned". Bucketed by
 * the database's own timezone-aware `$isoDayOfWeek`/`$hour` rather than the
 * fixed-offset shift above: hour-of-day is exactly the case context.md §9 says
 * `period.js` does not own, and there is no second definition of a *day* here —
 * only a weekday and an hour.
 *
 * Only settled spending counts. A manual note is excluded even though budgets
 * include it: its timestamp is when the user typed it, not when they spent, so
 * it would paint a rhythm of data entry rather than of spending. Top-ups,
 * refunds and adjustments are excluded for the same reason they are excluded
 * from budgets.
 */
export const getSpendingRhythm = async (userId, { range = '3M' } = {}) => {
    const resolved = resolveRange(asEnum(range, RHYTHM_RANGES, '3M'));

    const rows = await Transaction.aggregate([
        {
            $match: {
                userId: new mongoose.Types.ObjectId(userId),
                type: 'Debit',
                settlement: 'settled',
                status: { $in: SETTLED_STATUSES },
                category: { $nin: EXCLUDED_FROM_BUDGET },
                postedAt: { $gte: resolved.currentStart, $lte: resolved.now },
            },
        },
        {
            $group: {
                _id: {
                    day: { $isoDayOfWeek: { date: '$postedAt', timezone: APP_TIMEZONE } },
                    hour: { $hour: { date: '$postedAt', timezone: APP_TIMEZONE } },
                },
                amount: { $sum: AMOUNT_MINOR_EXPR },
                count: { $sum: 1 },
            },
        },
    ]);

    // Summed in paise and converted once per cell/total, so a row or column
    // total is exact rather than a sum of already-rounded rupee cells.
    const minor = WEEKDAYS.map(() => Array(24).fill(0));
    const counts = WEEKDAYS.map(() => Array(24).fill(0));
    for (const row of rows) {
        minor[row._id.day - 1][row._id.hour] = row.amount;
        counts[row._id.day - 1][row._id.hour] = row.count;
    }

    let peak = null;
    minor.forEach((hours, day) => hours.forEach((cell, hour) => {
        if (cell > 0 && (!peak || cell > peak.amountMinor)) {
            peak = { day, hour, amount: fromPaise(cell), amountMinor: cell, count: counts[day][hour] };
        }
    }));
    if (peak) delete peak.amountMinor;

    const sumMinor = (list) => list.reduce((a, b) => a + b, 0);
    return {
        range: resolved.range,
        timezone: APP_TIMEZONE,
        days: WEEKDAYS,
        amounts: minor.map((hours) => hours.map(fromPaise)),
        counts,
        byDay: minor.map((hours) => fromPaise(sumMinor(hours))),
        byHour: Array.from({ length: 24 }, (_, hour) => fromPaise(sumMinor(minor.map((d) => d[hour])))),
        totalAmount: fromPaise(sumMinor(minor.map(sumMinor))),
        transactionCount: counts.flat().reduce((a, b) => a + b, 0),
        peak,
    };
};

export { APP_TIMEZONE };
