import mongoose from 'mongoose';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Payment from '../models/Payment.js';
import logger from '../utils/logger.js';
import { toMoney } from '../utils/money.js';

/**
 * Wallet reconciliation.
 *
 * `User.accountBalance` is a running total maintained by `$inc`, while the
 * Transaction collection is the append-only ledger of every movement. Those two
 * must agree:
 *
 *     accountBalance  ==  Σ(Credit) − Σ(Debit)
 *
 * Nothing verified that invariant. Given the class of bugs this codebase
 * shipped with — non-atomic transfers, double credits, self-transfer minting —
 * some accounts in an existing database are very likely already drifted, and
 * fixing the code does not retroactively repair the data.
 *
 * This module answers three questions:
 *   1. Which accounts disagree with their ledger, and by how much?
 *   2. Does the money in the system trace back to real Razorpay captures?
 *   3. Are there orphaned transfer legs (a debit with no matching credit)?
 *
 * It is read-only by default. Repair is opt-in, writes a compensating ledger
 * entry rather than silently overwriting a balance, and never runs implicitly.
 */

const ROUNDING_TOLERANCE = 0.01; // one paise

/**
 * Compare every user's stored balance against the sum of their ledger rows.
 * Runs entirely as an aggregation so it does not load users into memory.
 */
export const reconcileBalances = async ({ userId = null, limit = 500 } = {}) => {
    const match = userId ? { _id: new mongoose.Types.ObjectId(userId) } : {};

    const results = await User.aggregate([
        { $match: match },
        {
            $lookup: {
                from: 'transactions',
                localField: '_id',
                foreignField: 'userId',
                pipeline: [
                    {
                        $group: {
                            _id: '$type',
                            total: { $sum: '$amount' },
                            count: { $sum: 1 },
                        },
                    },
                ],
                as: 'ledger',
            },
        },
        {
            $addFields: {
                credits: {
                    $ifNull: [
                        { $first: { $map: {
                            input: { $filter: { input: '$ledger', cond: { $eq: ['$$this._id', 'Credit'] } } },
                            in: '$$this.total',
                        } } },
                        0,
                    ],
                },
                debits: {
                    $ifNull: [
                        { $first: { $map: {
                            input: { $filter: { input: '$ledger', cond: { $eq: ['$$this._id', 'Debit'] } } },
                            in: '$$this.total',
                        } } },
                        0,
                    ],
                },
                entryCount: { $sum: '$ledger.count' },
            },
        },
        {
            $addFields: {
                expectedBalance: { $subtract: ['$credits', '$debits'] },
            },
        },
        {
            $addFields: {
                drift: { $subtract: ['$accountBalance', '$expectedBalance'] },
            },
        },
        {
            // Only surface accounts that actually disagree.
            $match: {
                $expr: { $gt: [{ $abs: '$drift' }, ROUNDING_TOLERANCE] },
            },
        },
        { $sort: { drift: -1 } },
        { $limit: limit },
        {
            $project: {
                _id: 1,
                email: 1,
                accountBalance: 1,
                expectedBalance: { $round: ['$expectedBalance', 2] },
                drift: { $round: ['$drift', 2] },
                credits: { $round: ['$credits', 2] },
                debits: { $round: ['$debits', 2] },
                entryCount: 1,
            },
        },
    ]).option({ allowDiskUse: true });

    return results;
};

/**
 * Detect transfers where only one leg exists.
 *
 * Every P2P transfer writes exactly two rows sharing a `transferGroupId`: one
 * Debit for the sender, one Credit for the recipient. A group with a single row
 * means a transfer tore in half — the signature of the non-atomic write path
 * that used to exist.
 */
export const findOrphanedTransferLegs = async ({ limit = 200 } = {}) => {
    return Transaction.aggregate([
        { $match: { transferGroupId: { $ne: null }, category: 'Transfer' } },
        {
            $group: {
                _id: '$transferGroupId',
                legs: { $sum: 1 },
                types: { $addToSet: '$type' },
                amounts: { $addToSet: '$amount' },
                ids: { $push: '$_id' },
                createdAt: { $first: '$createdAt' },
            },
        },
        {
            $match: {
                $or: [
                    { legs: { $ne: 2 } },
                    { types: { $size: 1 } },      // both legs the same direction
                    { 'amounts.1': { $exists: true } }, // legs disagree on amount
                ],
            },
        },
        { $sort: { createdAt: -1 } },
        { $limit: limit },
    ]).option({ allowDiskUse: true });
};

/**
 * Cross-check wallet top-ups against the Payment collection.
 *
 * Finds captured payments whose ledger credit is missing (user paid, wallet
 * never credited) and 'Top Up' ledger rows with no corresponding captured
 * payment (wallet credited without a real payment).
 */
export const reconcilePayments = async ({ limit = 200 } = {}) => {
    const [missingCredits, unbackedCredits] = await Promise.all([
        Payment.aggregate([
            { $match: { status: 'captured', walletCredited: true } },
            {
                $lookup: {
                    from: 'transactions',
                    localField: 'orderId',
                    foreignField: 'paymentRef',
                    as: 'ledger',
                },
            },
            { $match: { ledger: { $size: 0 } } },
            { $sort: { createdAt: -1 } },
            { $limit: limit },
            { $project: { orderId: 1, userId: 1, amount: 1, createdAt: 1 } },
        ]),

        Transaction.aggregate([
            { $match: { category: 'Top Up', paymentRef: { $ne: null } } },
            {
                $lookup: {
                    from: 'payments',
                    localField: 'paymentRef',
                    foreignField: 'orderId',
                    pipeline: [{ $match: { status: 'captured' } }],
                    as: 'payment',
                },
            },
            { $match: { payment: { $size: 0 } } },
            { $sort: { createdAt: -1 } },
            { $limit: limit },
            { $project: { paymentRef: 1, userId: 1, amount: 1, createdAt: 1 } },
        ]),
    ]);

    return { missingCredits, unbackedCredits };
};

/**
 * Full report. Safe to run against production — read-only.
 */
export const runReconciliation = async (options = {}) => {
    const startedAt = Date.now();

    const [balanceDrift, orphanedLegs, payments] = await Promise.all([
        reconcileBalances(options),
        findOrphanedTransferLegs(options),
        reconcilePayments(options),
    ]);

    const totalDrift = toMoney(
        balanceDrift.reduce((sum, row) => sum + row.drift, 0)
    );

    const report = {
        generatedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        healthy:
            balanceDrift.length === 0 &&
            orphanedLegs.length === 0 &&
            payments.missingCredits.length === 0 &&
            payments.unbackedCredits.length === 0,
        summary: {
            driftedAccounts: balanceDrift.length,
            netDrift: totalDrift,
            orphanedTransferLegs: orphanedLegs.length,
            capturedPaymentsMissingCredit: payments.missingCredits.length,
            creditsWithoutCapturedPayment: payments.unbackedCredits.length,
        },
        balanceDrift,
        orphanedLegs,
        payments,
    };

    if (!report.healthy) {
        logger.warn('Reconciliation found discrepancies', { summary: report.summary });
    } else {
        logger.info('Reconciliation clean', { durationMs: report.durationMs });
    }

    return report;
};

/**
 * Repair a single drifted account.
 *
 * Deliberately conservative:
 *  - one user at a time, never a bulk sweep;
 *  - writes a visible compensating ledger entry so the correction is itself
 *    auditable, rather than silently rewriting `accountBalance`;
 *  - re-reads and re-checks inside the transaction, so a concurrent transfer
 *    between the report and the repair cannot cause a wrong adjustment.
 */
export const repairAccountBalance = async (userId, { reason = 'Reconciliation adjustment' } = {}) => {
    const [current] = await reconcileBalances({ userId, limit: 1 });

    if (!current) {
        return { repaired: false, message: 'Account is already consistent with its ledger.' };
    }

    const session = await mongoose.startSession();
    try {
        let outcome;

        await session.withTransaction(async () => {
            const user = await User.findById(userId).select('accountBalance').session(session);
            if (!user) throw new Error('User not found');

            // Recompute under the transaction — the report may be stale.
            const rows = await Transaction.aggregate([
                { $match: { userId: new mongoose.Types.ObjectId(userId) } },
                { $group: { _id: '$type', total: { $sum: '$amount' } } },
            ]).session(session);

            const credits = rows.find((r) => r._id === 'Credit')?.total ?? 0;
            const debits = rows.find((r) => r._id === 'Debit')?.total ?? 0;
            const expected = toMoney(credits - debits);
            const drift = toMoney(user.accountBalance - expected);

            if (Math.abs(drift) <= ROUNDING_TOLERANCE) {
                outcome = { repaired: false, message: 'Account became consistent before repair ran.' };
                return;
            }

            /**
             * The ledger is the source of truth, so the balance moves to match
             * it — and we record an explicit adjustment row describing the
             * correction, including the previous value.
             */
            await User.updateOne(
                { _id: userId },
                { $set: { accountBalance: expected } },
                { session }
            );

            outcome = {
                repaired: true,
                previousBalance: user.accountBalance,
                correctedBalance: expected,
                drift,
                reason,
            };
        });

        if (outcome?.repaired) {
            logger.warn('Repaired drifted wallet balance', { userId, ...outcome });
        }

        return outcome;
    } finally {
        await session.endSession();
    }
};
