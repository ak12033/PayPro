import mongoose from 'mongoose';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Payment from '../models/Payment.js';
import logger from '../utils/logger.js';
import { fromPaise, AMOUNT_MINOR_EXPR } from '../utils/money.js';
import { BALANCE_MATCH, TX_SOURCE, TX_SETTLEMENT, TX_STATUS } from '../constants/transactionStatus.js';
import { createLedgerEntry } from './ledgerService.js';

/**
 * Only rows that actually moved (or still move) real balance participate in
 * the invariant: a manual note (`settlement: 'none'`) never touched
 * `accountBalance`, and a PENDING/FAILED/CANCELLED row hasn't (or never will)
 * either. A REFUNDED row *did* — see BALANCE_STATUSES for why it is included —
 * and so does a withdrawal or bill payment still PENDING/PROCESSING, whose
 * money is held out of the wallet (HOLD_SOURCES, Phase 5).
 * Reused by every aggregation below so "what counts as settled" has exactly
 * one definition.
 */
export const SETTLED_MATCH = BALANCE_MATCH;

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

/**
 * Compare every user's stored balance against the sum of their ledger rows.
 * Runs entirely as an aggregation so it does not load users into memory.
 *
 * The comparison is in integer paise (`balanceMinor` against Σ`amountMinor`),
 * with **zero tolerance** (plan.md §7.4 step 3). It used to compare rupee
 * doubles within a one-paisa tolerance, because summing doubles cannot be
 * exact; integers can, so any difference at all is real drift. The rupee
 * fields in each row (`accountBalance`, `expectedBalance`, `drift`, …) are
 * derived from the minor values for display and for older callers.
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
                    { $match: SETTLED_MATCH },
                    {
                        $group: {
                            _id: '$type',
                            total: { $sum: AMOUNT_MINOR_EXPR },
                            count: { $sum: 1 },
                        },
                    },
                ],
                as: 'ledger',
            },
        },
        {
            $addFields: {
                creditsMinor: {
                    $ifNull: [
                        { $first: { $map: {
                            input: { $filter: { input: '$ledger', cond: { $eq: ['$$this._id', 'Credit'] } } },
                            in: '$$this.total',
                        } } },
                        0,
                    ],
                },
                debitsMinor: {
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
                balanceMinor: { $ifNull: ['$balanceMinor', 0] },
                expectedMinor: { $subtract: ['$creditsMinor', '$debitsMinor'] },
            },
        },
        {
            $addFields: {
                driftMinor: { $subtract: ['$balanceMinor', '$expectedMinor'] },
            },
        },
        // Only surface accounts that actually disagree.
        { $match: { driftMinor: { $ne: 0 } } },
        { $sort: { driftMinor: -1 } },
        { $limit: limit },
        {
            $project: {
                _id: 1,
                email: 1,
                balanceMinor: 1,
                expectedMinor: 1,
                driftMinor: 1,
                creditsMinor: 1,
                debitsMinor: 1,
                entryCount: 1,
            },
        },
    ]).option({ allowDiskUse: true });

    return results.map((row) => ({
        ...row,
        accountBalance: fromPaise(row.balanceMinor),
        expectedBalance: fromPaise(row.expectedMinor),
        drift: fromPaise(row.driftMinor),
        credits: fromPaise(row.creditsMinor),
        debits: fromPaise(row.debitsMinor),
    }));
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
                amounts: { $addToSet: AMOUNT_MINOR_EXPR },
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
                    // A PENDING row is created up-front at checkout (see
                    // paymentController.createOrder), so it always exists —
                    // only a *settled* row proves the wallet was actually
                    // credited.
                    pipeline: [{ $match: { status: 'SUCCESS' } }],
                    as: 'ledger',
                },
            },
            { $match: { ledger: { $size: 0 } } },
            { $sort: { createdAt: -1 } },
            { $limit: limit },
            { $project: { orderId: 1, userId: 1, amount: 1, createdAt: 1 } },
        ]),

        Transaction.aggregate([
            { $match: { category: 'Top Up', status: 'SUCCESS', paymentRef: { $ne: null } } },
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

    const totalDriftMinor = balanceDrift.reduce((sum, row) => sum + row.driftMinor, 0);

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
            netDrift: fromPaise(totalDriftMinor),
            netDriftMinor: totalDriftMinor,
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
 *
 * How the compensating row relates to the ledger sum it corrects (plan.md
 * §0.15). Drift means the *balance* disagrees with rows that are already
 * correct, so the balance moves to the ledger — and the row describing that
 * move is written `settlement: 'none'`, `source: 'adjustment'`. It cannot be a
 * settled row: a settled row for the drift amount would change the very sum
 * the balance was just set to, and the account would be reported as drifted by
 * exactly the correction on the next run. As a note it shows up in Activity and
 * in the admin transaction search, carries the actor, reason and before/after
 * values (§29.3 rule 3), and never enters any balance aggregation. It is written
 * in the same transaction as the balance change, so one never exists without
 * the other.
 *
 * An operator who instead needs to move money — a goodwill credit, say — uses
 * `ledgerService.applyAdjustment`, which *is* a settled movement.
 */
export const repairAccountBalance = async (userId, { reason = 'Reconciliation adjustment', actorId = null } = {}) => {
    const [current] = await reconcileBalances({ userId, limit: 1 });

    if (!current) {
        return { repaired: false, message: 'Account is already consistent with its ledger.' };
    }

    const session = await mongoose.startSession();
    try {
        let outcome;

        await session.withTransaction(async () => {
            const user = await User.findById(userId).select('balanceMinor').session(session);
            if (!user) throw new Error('User not found');

            // Recompute under the transaction — the report may be stale.
            const rows = await Transaction.aggregate([
                { $match: { userId: new mongoose.Types.ObjectId(userId), ...SETTLED_MATCH } },
                { $group: { _id: '$type', total: { $sum: AMOUNT_MINOR_EXPR } } },
            ]).session(session);

            const creditsMinor = rows.find((r) => r._id === 'Credit')?.total ?? 0;
            const debitsMinor = rows.find((r) => r._id === 'Debit')?.total ?? 0;
            const expectedMinor = creditsMinor - debitsMinor;
            const previousMinor = user.balanceMinor ?? 0;
            const driftMinor = previousMinor - expectedMinor;
            const expected = fromPaise(expectedMinor);
            const previousBalance = fromPaise(previousMinor);
            const drift = fromPaise(driftMinor);

            if (driftMinor === 0) {
                outcome = { repaired: false, message: 'Account became consistent before repair ran.' };
                return;
            }

            /**
             * The ledger is the source of truth, so the balance moves to match
             * it — and we record an explicit adjustment row describing the
             * correction, including the previous value.
             */
            // `accountBalance` is set with it — the rupee column stays written
            // for one release as the rollback path (plan.md §7.4 step 3).
            await User.updateOne(
                { _id: userId },
                { $set: { accountBalance: expected, balanceMinor: expectedMinor } },
                { session }
            );

            const note = await createLedgerEntry({
                userId: user._id,
                description: `Balance corrected: ${reason}`.slice(0, 280),
                amount: Math.abs(drift),
                // The direction the *balance* moved: a balance that was too high
                // came down (Debit), one that was too low went up (Credit).
                type: drift > 0 ? 'Debit' : 'Credit',
                category: 'Adjustment',
                icon: 'Scale',
                source: TX_SOURCE.ADJUSTMENT,
                settlement: TX_SETTLEMENT.NONE,
                status: TX_STATUS.SUCCESS,
                categorySource: 'system',
                adjustment: {
                    kind: 'repair',
                    reason,
                    actorId,
                    previousBalance,
                    correctedBalance: expected,
                },
            }, session);

            outcome = {
                repaired: true,
                previousBalance,
                correctedBalance: expected,
                drift,
                driftMinor,
                reason,
                transactionId: String(note._id),
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
