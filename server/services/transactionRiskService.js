import mongoose from 'mongoose';
import securityConfig from '../config/security.js';
import Transaction from '../models/Transaction.js';
import TrustedDevice from '../models/TrustedDevice.js';
import RiskCase from '../models/RiskCase.js';
import { APP_TIMEZONE } from '../utils/period.js';
import logger from '../utils/logger.js';
import { balanceOf } from '../utils/money.js';

/**
 * Transaction risk (plan.md §30.2).
 *
 * Deterministic rules first, model second. The previous arrangement sent every
 * transfer to Gemini, stored `{risk_score, risk_level, reason}` on the row, and
 * then did nothing with it — a fraud control that produces a number nobody acts
 * on is documentation, not a control.
 *
 * This module is split the same way `riskEvaluationService` is, and for the
 * same reason: `evaluateTransaction` is a pure function of its inputs, so every
 * rule and every band edge is testable without a database, a clock or a
 * request. `gatherSignals` is the impure half that goes and finds those inputs.
 *
 * The model is one weighted signal among eight rules (see `weights.model` in
 * config/security.js). When it fails, the rules still run — §30.2.4's
 * "fail-open remains, but visibly": a total control outage becomes a degraded
 * one.
 */

export const TXN_RISK_RULES = {
    NEW_RECIPIENT_HIGH_VALUE: 'NEW_RECIPIENT_HIGH_VALUE',
    VELOCITY: 'VELOCITY',
    AMOUNT_ANOMALY: 'AMOUNT_ANOMALY',
    BALANCE_DRAIN: 'BALANCE_DRAIN',
    DORMANT_REACTIVATION: 'DORMANT_REACTIVATION',
    NEW_DEVICE_MONEY_MOVEMENT: 'NEW_DEVICE_MONEY_MOVEMENT',
    ODD_HOUR: 'ODD_HOUR',
    RAPID_TOPUP_THEN_SEND: 'RAPID_TOPUP_THEN_SEND',
    MODEL: 'MODEL_SCORE',
};

export const TXN_RISK_ACTION = {
    ALLOW: 'allow',
    STEP_UP: 'step_up',
    HOLD: 'hold',
    BLOCK: 'block',
};

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Hour of day in IST, 0-23. `period.js` owns day/month boundaries; this is the only hour-of-day need. */
const istHour = (date) => new Date(date.getTime() + IST_OFFSET_MS).getUTCHours();

const median = (values) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Score a transfer. Pure.
 *
 * @param {object} input
 * @param {number} input.amount               the transfer amount, in rupees
 * @param {number} input.balance              the sender's balance before the transfer
 * @param {boolean} input.isNewRecipient      no prior settled transfer to this recipient
 * @param {number} input.recentTransferCount  transfers inside the velocity window
 * @param {number} input.medianDebit          90-day median settled debit
 * @param {number} input.debitSampleSize      how many rows that median came from
 * @param {number|null} input.daysSinceLastActivity
 * @param {number|null} input.minutesSinceDeviceFirstSeen  null when the device is not new
 * @param {Date} input.at                     when the transfer is happening
 * @param {object|null} input.model           `{ risk_score, reason }` from checkFraud, or null
 * @param {object|null} input.recentTopup     `{ amount, at }` of the most recent captured top-up
 */
export const evaluateTransaction = ({
    amount,
    balance = 0,
    isNewRecipient = false,
    recentTransferCount = 0,
    medianDebit = 0,
    debitSampleSize = 0,
    daysSinceLastActivity = null,
    minutesSinceDeviceFirstSeen = null,
    at = new Date(),
    model = null,
    recentTopup = null,
} = {}) => {
    const { weights, thresholds, bands } = securityConfig.transactionRisk;

    const rules = [];
    const add = (code, weight, detail) => {
        if (weight === 0) return;
        rules.push({ code, weight, detail });
    };

    /**
     * The median-based rules need history to mean anything. With three
     * transactions on record, "5x your median" is satisfied by almost any
     * second transfer, and a brand-new user would be held on their first real
     * payment. Below the floor these rules simply do not fire — silence is the
     * honest output of an estimator with no data.
     */
    const hasHistory = debitSampleSize >= thresholds.minHistoryForMedian && medianDebit > 0;

    if (isNewRecipient && hasHistory && amount > medianDebit * thresholds.newRecipientMultiple) {
        add(
            TXN_RISK_RULES.NEW_RECIPIENT_HIGH_VALUE,
            weights.newRecipientHighValue,
            `First transfer to this recipient, and ${(amount / medianDebit).toFixed(1)}x the usual amount`
        );
    }

    if (recentTransferCount >= thresholds.velocityCount) {
        add(
            TXN_RISK_RULES.VELOCITY,
            weights.velocity,
            `${recentTransferCount} transfers in the last ${thresholds.velocityWindowMinutes} minutes`
        );
    }

    if (hasHistory && amount > medianDebit * thresholds.anomalyMultiple) {
        add(
            TXN_RISK_RULES.AMOUNT_ANOMALY,
            weights.amountAnomaly,
            `${(amount / medianDebit).toFixed(1)}x the 90-day median debit`
        );
    }

    if (balance > 0 && amount >= balance * thresholds.drainFraction) {
        add(
            TXN_RISK_RULES.BALANCE_DRAIN,
            weights.balanceDrain,
            `Moves ${Math.round((amount / balance) * 100)}% of the available balance`
        );
    }

    /**
     * Dormancy only matters paired with value. A user returning after two
     * months to send ₹50 is a user returning; the signal is the combination.
     */
    if (
        daysSinceLastActivity !== null
        && daysSinceLastActivity >= thresholds.dormantDays
        && hasHistory
        && amount > medianDebit * thresholds.newRecipientMultiple
    ) {
        add(
            TXN_RISK_RULES.DORMANT_REACTIVATION,
            weights.dormantReactivation,
            `No activity for ${Math.round(daysSinceLastActivity)} days, then a high-value transfer`
        );
    }

    if (
        minutesSinceDeviceFirstSeen !== null
        && minutesSinceDeviceFirstSeen <= thresholds.newDeviceMinutes
    ) {
        add(
            TXN_RISK_RULES.NEW_DEVICE_MONEY_MOVEMENT,
            weights.newDeviceMoneyMovement,
            `Transfer within ${Math.round(minutesSinceDeviceFirstSeen)} minutes of first sign-in on this device`
        );
    }

    const hour = istHour(at);
    if (hour >= thresholds.oddHourStart && hour < thresholds.oddHourEnd) {
        add(
            TXN_RISK_RULES.ODD_HOUR,
            weights.oddHour,
            `Initiated at ${String(hour).padStart(2, '0')}:00 ${APP_TIMEZONE}`
        );
    }

    if (recentTopup) {
        const minutesSinceTopup = (at - new Date(recentTopup.at)) / 60000;
        if (
            minutesSinceTopup >= 0
            && minutesSinceTopup <= thresholds.rapidTopupMinutes
            && amount >= recentTopup.amount * thresholds.rapidTopupFraction
        ) {
            add(
                TXN_RISK_RULES.RAPID_TOPUP_THEN_SEND,
                weights.rapidTopupThenSend,
                `Forwards ${Math.round((amount / recentTopup.amount) * 100)}% of a top-up received ${Math.round(minutesSinceTopup)} minutes ago`
            );
        }
    }

    /**
     * The model's contribution, scaled by its own confidence. Note what this
     * cannot do: at the default weight of 30 a maximally alarmed model adds 30
     * points, which reaches `stepUp` (40) only alongside at least one real rule,
     * and can never reach `block` (85) alone. The model informs; it does not
     * decide.
     */
    let modelScore = null;
    if (model && Number.isFinite(Number(model.risk_score))) {
        modelScore = Math.max(0, Math.min(100, Number(model.risk_score)));
        add(
            TXN_RISK_RULES.MODEL,
            Math.round((modelScore / 100) * weights.model),
            model.reason || 'Model-assessed risk'
        );
    }

    const score = Math.max(0, Math.min(100, rules.reduce((sum, r) => sum + r.weight, 0)));

    let action = TXN_RISK_ACTION.ALLOW;
    if (score >= bands.block) action = TXN_RISK_ACTION.BLOCK;
    else if (score >= bands.hold) action = TXN_RISK_ACTION.HOLD;
    else if (score >= bands.stepUp) action = TXN_RISK_ACTION.STEP_UP;

    return {
        score,
        action,
        rules,
        modelScore,
        modelReason: model?.reason || '',
        /** Kept for `Transaction.riskLevel`, whose enum predates this service. */
        level: score >= bands.hold ? 'high' : score >= bands.stepUp ? 'medium' : 'low',
        /** True when the model was asked and did not answer — §30.2.4's visible fail-open. */
        modelUnavailable: model === null,
    };
};

/**
 * Collect every signal `evaluateTransaction` needs, in as few round trips as
 * the shape of the data allows.
 *
 * Every query here is bounded. An unbounded `find()` on the hot path of a money
 * movement is exactly the failure mode §4.6 documented in the old AI tooling.
 */
export const gatherSignals = async ({ senderId, recipientId, amount, balance, deviceId, at = new Date() }) => {
    const { thresholds } = securityConfig.transactionRisk;
    const userId = new mongoose.Types.ObjectId(senderId);

    const ninetyDaysAgo = new Date(at.getTime() - 90 * 24 * 60 * 60 * 1000);
    const velocityWindowStart = new Date(at.getTime() - thresholds.velocityWindowMinutes * 60 * 1000);
    const topupWindowStart = new Date(at.getTime() - thresholds.rapidTopupMinutes * 60 * 1000);

    const [
        priorToRecipient,
        recentTransferCount,
        recentDebits,
        lastActivity,
        recentTopupRow,
        device,
    ] = await Promise.all([
        recipientId
            ? Transaction.exists({
                userId, recipientId, type: 'Debit', status: 'SUCCESS', settlement: 'settled',
            })
            : Promise.resolve(null),

        Transaction.countDocuments({
            userId, type: 'Debit', source: 'p2p', status: 'SUCCESS',
            createdAt: { $gte: velocityWindowStart },
        }),

        Transaction.find({
            userId, type: 'Debit', status: 'SUCCESS', settlement: 'settled',
            postedAt: { $gte: ninetyDaysAgo, $lte: at },
        }).select('amount -_id').limit(500).lean(),

        /**
         * The last activity *before* this attempt. Ordered by `postedAt` to
         * match how every other period query in the codebase buckets time.
         */
        Transaction.findOne({ userId, status: 'SUCCESS', settlement: 'settled' })
            .sort({ postedAt: -1 }).select('postedAt -_id').lean(),

        Transaction.findOne({
            userId, type: 'Credit', source: 'topup', status: 'SUCCESS', settlement: 'settled',
            postedAt: { $gte: topupWindowStart },
        }).sort({ postedAt: -1 }).select('amount postedAt -_id').lean(),

        deviceId
            ? TrustedDevice.findById(deviceId).select('firstSeenAt createdAt trusted').lean()
            : Promise.resolve(null),
    ]);

    const amounts = recentDebits.map((d) => Number(d.amount) || 0).filter((a) => a > 0);

    /**
     * A trusted device is never "new" for this purpose, however recently it was
     * enrolled — the user has already vouched for it, which is a stronger
     * statement than the timestamp.
     */
    let minutesSinceDeviceFirstSeen = null;
    if (device && !device.trusted) {
        const firstSeen = device.firstSeenAt || device.createdAt;
        if (firstSeen) minutesSinceDeviceFirstSeen = (at - new Date(firstSeen)) / 60000;
    }

    return {
        amount,
        balance,
        isNewRecipient: !priorToRecipient,
        recentTransferCount,
        medianDebit: median(amounts),
        debitSampleSize: amounts.length,
        daysSinceLastActivity: lastActivity
            ? (at - new Date(lastActivity.postedAt)) / (24 * 60 * 60 * 1000)
            : null,
        minutesSinceDeviceFirstSeen,
        recentTopup: recentTopupRow
            ? { amount: Number(recentTopupRow.amount), at: recentTopupRow.postedAt }
            : null,
        at,
    };
};

/**
 * The whole assessment: gather, score, and (for hold/block) open a case.
 *
 * Returns the evaluation regardless of outcome; the caller decides what to do
 * with `action`. A case is created here rather than by the caller so a `hold`
 * can never be acted on without a record of why.
 */
export const assessTransfer = async ({
    sender, recipient, amount, deviceId, model = null, at = new Date(),
}) => {
    let signals;
    try {
        signals = await gatherSignals({
            senderId: sender._id,
            recipientId: recipient?._id,
            amount,
            balance: balanceOf(sender),
            deviceId,
            at,
        });
    } catch (err) {
        /**
         * Signal gathering failing is not a reason to refuse a transfer — but it
         * is a reason to say so loudly. With no signals, every rule evaluates
         * false and the transfer is allowed, which is the same fail-open posture
         * the model path already had, now logged rather than silent.
         */
        logger.error('Transaction risk signal gathering failed; allowing transfer unscored', {
            userId: String(sender._id), error: err.message,
        });
        return {
            score: 0, action: TXN_RISK_ACTION.ALLOW, rules: [], modelScore: null,
            modelReason: '', level: 'low', modelUnavailable: true, degraded: true,
        };
    }

    const evaluation = evaluateTransaction({ ...signals, model });

    if (evaluation.action === TXN_RISK_ACTION.HOLD || evaluation.action === TXN_RISK_ACTION.BLOCK) {
        const isBlock = evaluation.action === TXN_RISK_ACTION.BLOCK;
        const riskCase = await RiskCase.create({
            userId: sender._id,
            score: evaluation.score,
            intent: {
                kind: 'transfer',
                amount,
                recipientId: recipient?._id,
                recipientName: recipient?.firstName,
            },
            rules: evaluation.rules,
            modelScore: evaluation.modelScore,
            modelReason: evaluation.modelReason,
            action: isBlock ? 'block' : 'hold',
            priority: isBlock ? 'urgent' : 'normal',
            // A block committed no money, so there is nothing for a timer to free.
            autoReleaseAt: isBlock
                ? null
                : new Date(at.getTime() + securityConfig.transactionRisk.autoReleaseHours * 3600 * 1000),
        });
        return { ...evaluation, riskCase };
    }

    return evaluation;
};

export default {
    TXN_RISK_RULES,
    TXN_RISK_ACTION,
    evaluateTransaction,
    gatherSignals,
    assessTransfer,
};
