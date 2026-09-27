import Transaction from '../models/Transaction.js';
import RecurringExpense from '../models/RecurringExpense.js';
import { EXCLUDED_FROM_BUDGET } from '../constants/categories.js';
import { toPaise, fromPaise, amountMinorOf } from '../utils/money.js';
import { iconFor } from './categoryService.js';
import { normaliseMerchant } from '../utils/merchant.js';

/**
 * Recurring-payment detection (plan.md §18.1).
 *
 * A heuristic, and treated as one throughout: it proposes, the user disposes.
 * Nothing here moves money, cancels anything, or is presented to the user as a
 * fact — §18.3 requires the copy to say "looks like a recurring payment".
 *
 * The pipeline is the plan's, in order:
 *   1. candidate set  -> settled SUCCESS debits, last 180 days
 *   2. group          -> normalised merchant key
 *   3. cadence        -> inter-arrival mean within a band, stddev <= 20%
 *   4. amount         -> coefficient of variation <= 15%, or exact equality
 *   5. confidence     -> f(occurrences, interval stddev, amount CV)
 *   6. upsert         -> one row per {userId, merchantKey}, next date predicted
 */

export class RecurringError extends Error {
    constructor(code, message, status = 400) {
        super(message);
        this.name = 'RecurringError';
        this.code = code;
        this.status = status;
    }
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const LOOKBACK_DAYS = 180;
export const MIN_OCCURRENCES = 3;
/** Interval stddev must be within this fraction of the mean (plan.md §18.1 step 3). */
export const MAX_INTERVAL_CV = 0.2;
/** Amount coefficient of variation ceiling (step 4). */
export const MAX_AMOUNT_CV = 0.15;
/** Below this, the signal is too weak to show the user at all. */
export const MIN_CONFIDENCE = 0.5;

/**
 * Cadence bands, in days. Deliberately non-contiguous: a mean interval of 15
 * days matches nothing and the group is discarded rather than forced into
 * whichever band is nearest. "Fortnightly-ish, or noise?" is not a question a
 * detector should answer by guessing.
 */
const CADENCE_BANDS = [
    { cadence: 'weekly', min: 6, max: 8 },
    { cadence: 'monthly', min: 26, max: 35 },
    { cadence: 'quarterly', min: 85, max: 95 },
    { cadence: 'yearly', min: 355, max: 375 },
];

const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

const stddev = (values) => {
    if (values.length < 2) return 0;
    const m = mean(values);
    return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
};

const median = (values) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const bandFor = (intervalDays) =>
    CADENCE_BANDS.find((b) => intervalDays >= b.min && intervalDays <= b.max) || null;

/**
 * Confidence, on [0,1], from the three things that make a detection credible:
 * how many times it has happened, how regular the spacing is, and how stable
 * the amount is. Equal weights — there is no evidence justifying anything more
 * precise, and inventing weights would imply calibration that has not happened.
 */
const scoreConfidence = ({ occurrences, intervalCv, amountCv }) => {
    const occurrenceScore = Math.min(1, (occurrences - MIN_OCCURRENCES + 1) / 4);
    const regularityScore = Math.max(0, 1 - intervalCv / MAX_INTERVAL_CV);
    const stabilityScore = Math.max(0, 1 - amountCv / MAX_AMOUNT_CV);
    const raw = (occurrenceScore + regularityScore + stabilityScore) / 3;
    // Two decimals: the inputs do not support more precision than that.
    return Math.round(raw * 100) / 100;
};

/**
 * Classify one merchant group. Pure — no database, no clock beyond the `now`
 * passed in — so every band edge and rejection reason is unit-testable.
 *
 * @returns {object|null} the detection, or null when the group is not recurring.
 */
export const classifyGroup = (transactions, now = new Date()) => {
    if (transactions.length < MIN_OCCURRENCES) return null;

    const sorted = [...transactions].sort((a, b) => new Date(a.postedAt) - new Date(b.postedAt));

    const intervals = [];
    for (let i = 1; i < sorted.length; i += 1) {
        intervals.push((new Date(sorted[i].postedAt) - new Date(sorted[i - 1].postedAt)) / DAY_MS);
    }

    const intervalMean = mean(intervals);
    if (intervalMean <= 0) return null;

    const intervalCv = stddev(intervals) / intervalMean;
    if (intervalCv > MAX_INTERVAL_CV) return null;

    const band = bandFor(intervalMean);
    if (!band) return null;

    const amounts = sorted.map((t) => fromPaise(amountMinorOf(t)));
    const amountMean = mean(amounts);
    if (amountMean <= 0) return null;

    const allEqual = amounts.every((a) => a === amounts[0]);
    const amountCv = allEqual ? 0 : stddev(amounts) / amountMean;
    if (amountCv > MAX_AMOUNT_CV) return null;

    const confidence = scoreConfidence({ occurrences: sorted.length, intervalCv, amountCv });
    if (confidence < MIN_CONFIDENCE) return null;

    const lastSeenAt = new Date(sorted[sorted.length - 1].postedAt);

    /**
     * Predict forward from the last occurrence, then roll forward past any
     * periods already elapsed. Without the roll-forward, a subscription whose
     * last charge was 70 days ago would be "expected" 40 days in the past, and
     * the upcoming-payments forecast would show it as due — which reads as a
     * missed payment rather than as stale detection.
     */
    let nextExpectedAt = new Date(lastSeenAt.getTime() + intervalMean * DAY_MS);
    while (nextExpectedAt < now) {
        nextExpectedAt = new Date(nextExpectedAt.getTime() + intervalMean * DAY_MS);
    }

    return {
        cadence: band.cadence,
        amountMinor: toPaise(median(amounts)),
        amountVariesFlag: !allEqual,
        firstSeenAt: new Date(sorted[0].postedAt),
        lastSeenAt,
        nextExpectedAt,
        occurrences: sorted.length,
        confidence,
        // Most recent wins: a merchant that renamed itself should show its
        // current name, not the one it had six months ago.
        displayName: String(sorted[sorted.length - 1].description || '').slice(0, 80),
        category: sorted[sorted.length - 1].category,
        icon: sorted[sorted.length - 1].icon || iconFor(sorted[sorted.length - 1].category),
        transactionIds: sorted.map((t) => t._id),
    };
};

/**
 * Run detection for one user and persist the results.
 *
 * @returns {Promise<{detected:number, created:number, updated:number}>}
 */
export const detectForUser = async (userId, now = new Date()) => {
    const since = new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS);

    const transactions = await Transaction.find({
        userId,
        type: 'Debit',
        status: 'SUCCESS',
        // A manual note (`settlement: 'none'`) is the user's own record of
        // spending that happened elsewhere. Excluding it would miss exactly the
        // subscriptions PayPro cannot see directly, which is the case this
        // feature exists for — so both settled and unsettled rows are eligible.
        settlement: { $in: ['settled', 'none'] },
        category: { $nin: EXCLUDED_FROM_BUDGET },
        postedAt: { $gte: since, $lte: now },
    })
        .select('_id description category icon amount amountMinor postedAt counterparty')
        .lean();

    const groups = new Map();
    for (const tx of transactions) {
        const key = normaliseMerchant(tx.counterparty?.name || tx.description);
        // A description that normalises to nothing (pure digits, punctuation)
        // cannot be grouped meaningfully — grouping them all under '' would
        // merge unrelated merchants into one fictional subscription.
        if (!key) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(tx);
    }

    let created = 0;
    let updated = 0;
    const detected = [];

    for (const [merchantKey, group] of groups) {
        const detection = classifyGroup(group, now);
        if (!detection) continue;
        detected.push(merchantKey);

        const existing = await RecurringExpense.findOne({ userId, merchantKey });

        if (!existing) {
            await RecurringExpense.create({ userId, merchantKey, ...detection });
            created += 1;
            continue;
        }

        /**
         * A dismissal is permanent (plan.md §18.4: "dismissing an item keeps it
         * dismissed across subsequent detection runs"). Re-running detection
         * must not resurrect it, so the observation fields are refreshed but
         * `status` is left exactly as the user set it.
         */
        const update = {
            amountMinor: detection.amountMinor,
            amountVariesFlag: detection.amountVariesFlag,
            cadence: detection.cadence,
            firstSeenAt: detection.firstSeenAt,
            lastSeenAt: detection.lastSeenAt,
            nextExpectedAt: detection.nextExpectedAt,
            occurrences: detection.occurrences,
            confidence: detection.confidence,
            transactionIds: detection.transactionIds,
        };

        // A rename or re-categorisation by the user outranks the detector's
        // guess, forever. Detection still updates everything else.
        if (!existing.userEdited) {
            update.displayName = detection.displayName;
            update.category = detection.category;
            update.icon = detection.icon;
        }

        await RecurringExpense.updateOne({ _id: existing._id }, { $set: update });
        updated += 1;
    }

    return { detected: detected.length, created, updated };
};

export const listRecurring = (userId, { status = 'active' } = {}) => {
    const query = { userId };
    if (status !== 'all') query.status = status;
    return RecurringExpense.find(query).sort({ nextExpectedAt: 1 }).lean();
};

/** Everything due within `days`, for the forecast card and the budget projection. */
export const getUpcoming = async (userId, { days = 30, now = new Date() } = {}) => {
    const until = new Date(now.getTime() + days * DAY_MS);
    const items = await RecurringExpense.find({
        userId,
        status: 'active',
        nextExpectedAt: { $lte: until },
    }).sort({ nextExpectedAt: 1 }).lean();

    const totalMinor = items.reduce((sum, item) => sum + item.amountMinor, 0);
    return { items, totalMinor, total: fromPaise(totalMinor), days };
};

export const updateRecurring = async (userId, id, payload) => {
    const item = await RecurringExpense.findOne({ _id: id, userId });
    if (!item) throw new RecurringError('NOT_FOUND', 'Recurring payment not found', 404);

    if (payload.displayName !== undefined) {
        item.displayName = payload.displayName;
        item.userEdited = true;
    }
    if (payload.category !== undefined) {
        item.category = payload.category;
        // Kept in step with the category it is derived from; a stale icon from
        // the previous category is worse than no icon.
        item.icon = iconFor(payload.category);
        item.userEdited = true;
    }
    if (payload.status !== undefined) item.status = payload.status;

    await item.save();
    return item;
};

/** Dismiss a false positive. Kept as a row (not deleted) so detection remembers. */
export const dismissRecurring = async (userId, id) => {
    const item = await RecurringExpense.findOneAndUpdate(
        { _id: id, userId },
        { $set: { status: 'dismissed' } },
        { new: true }
    );
    if (!item) throw new RecurringError('NOT_FOUND', 'Recurring payment not found', 404);
    return item;
};

/** Re-exported so callers of this service need not know where the helper lives. */
export { normaliseMerchant };

export default {
    normaliseMerchant,
    classifyGroup,
    detectForUser,
    listRecurring,
    getUpcoming,
    updateRecurring,
    dismissRecurring,
    RecurringError,
};
