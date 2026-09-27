import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import { SETTLED_MATCH } from './reconciliationService.js';
import { TX_STATUS, TX_SETTLEMENT } from '../constants/transactionStatus.js';

/**
 * Integer-paise migration, step 2 of 3: backfill + verify (plan.md §7.4).
 *
 * Step 1 (Phase 2) made every *new* write populate `Transaction.amountMinor`
 * and `$inc` `User.balanceMinor` in lockstep with the rupee fields. That left
 * two kinds of historical gap:
 *
 *   1. Transactions written before Phase 2 have no `amountMinor` at all.
 *   2. Users who existed before Phase 2 have a `balanceMinor` that is wrong,
 *      not merely missing — `$inc` on an absent field starts from 0, so their
 *      value is "every movement since Phase 2", not their balance.
 *
 * Both are fixed with an **aggregation-pipeline update**, which computes the
 * new value from the rupee field *inside the same single-document write*.
 * That is what makes this safe to run against a live database: there is no
 * read-then-write window for a concurrent `$inc` to fall into, so a transfer
 * landing mid-backfill cannot be overwritten by a stale value. `$round` is
 * applied to `amount * 100` because 19.99 * 100 is 1998.9999999999998 in
 * IEEE-754 — the exact drift this whole migration exists to escape.
 *
 * Step 3 (reads flipped to the minor columns) has shipped: see utils/money.js.
 * A transaction the backfill has not reached is still read correctly —
 * `AMOUNT_MINOR_EXPR` derives an absent `amountMinor` from `amount` — but a
 * user is not: their `balanceMinor` is present and wrong, and the balance
 * guard now reads it. `checkMinorReadiness` runs at boot so that state is
 * reported as an error, not discovered as refused payments.
 */

const paiseOf = (field) => ({ $round: [{ $multiply: [field, 100] }, 0] });

/**
 * A transaction written before Phase 1, with no lifecycle fields in the stored
 * document at all.
 *
 * Phase 1 gave `status`/`settlement` schema defaults (SUCCESS/settled) and
 * concluded no backfill was needed (plan.md §0.2). That holds for documents
 * Mongoose hydrates — but a default is applied *on read*, never inside a query
 * filter or an aggregation `$match`. `{ settlement: 'settled' }` does not match
 * a document with no `settlement` field, so every legacy row was silently
 * excluded from reconciliation, analytics, cash flow, limits, insights and the
 * risk engine's history. Writing the defaults into the stored documents is the
 * fix that repairs every one of those queries at once, instead of teaching each
 * of them about missing fields.
 */
const TX_NEEDS_LIFECYCLE = {
    $or: [
        { status: { $exists: false } },
        { status: null },
        { settlement: { $exists: false } },
        { settlement: null },
    ],
};

/** A transaction whose `amountMinor` is absent, null, or disagrees with `amount`. */
const TX_NEEDS_BACKFILL = {
    $or: [
        { amountMinor: { $exists: false } },
        { amountMinor: null },
        { $expr: { $ne: ['$amountMinor', paiseOf('$amount')] } },
    ],
};

/** A user whose `balanceMinor` is absent, null, or disagrees with `accountBalance`. */
const USER_NEEDS_BACKFILL = {
    $or: [
        { balanceMinor: { $exists: false } },
        { balanceMinor: null },
        { $expr: { $ne: ['$balanceMinor', paiseOf('$accountBalance')] } },
    ],
};

/**
 * Rewrite one collection's minor column in id-ordered batches.
 *
 * Batched by `_id` range rather than one `updateMany`, so a very large
 * collection does not hold one long-running write, and so progress is
 * reportable. Idempotent: a second run matches nothing, because the filter is
 * "disagrees with the rupee field", not "has not been visited".
 */
const backfillCollection = async (Model, { filter, set, dryRun, batchSize, onProgress }) => {
    const pending = await Model.countDocuments(filter);
    if (dryRun || pending === 0) {
        return { pending, updated: 0, batches: 0 };
    }

    let updated = 0;
    let batches = 0;
    let lastId = null;

    for (;;) {
        const idFilter = lastId ? { _id: { $gt: lastId } } : {};
        const ids = await Model.find({ ...filter, ...idFilter })
            .sort({ _id: 1 })
            .limit(batchSize)
            .select('_id')
            .lean();
        if (ids.length === 0) break;

        // The filter is repeated in the update, not just the lookup: a row
        // that a live write already fixed between the two calls is left alone.
        const { modifiedCount } = await Model.updateMany(
            { _id: { $in: ids.map((d) => d._id) }, ...filter },
            [{ $set: set }]
        );

        updated += modifiedCount;
        batches += 1;
        lastId = ids[ids.length - 1]._id;
        onProgress?.({ updated, pending, batches });
    }

    return { pending, updated, batches };
};

export const backfillMinorColumns = async ({ dryRun = true, batchSize = 1000, onProgress } = {}) => {
    const size = Math.max(1, Math.min(10000, Number(batchSize) || 1000));

    // First, so the minor-ledger verification below sees legacy rows at all.
    // `$ifNull` keeps any field a row already has; only absent ones are filled,
    // with exactly the values the schema has been claiming they had.
    const lifecycle = await backfillCollection(Transaction, {
        filter: TX_NEEDS_LIFECYCLE,
        set: {
            status: { $ifNull: ['$status', TX_STATUS.SUCCESS] },
            settlement: { $ifNull: ['$settlement', TX_SETTLEMENT.SETTLED] },
        },
        dryRun,
        batchSize: size,
        onProgress: onProgress && ((p) => onProgress({ collection: 'transactions (lifecycle)', ...p })),
    });

    const transactions = await backfillCollection(Transaction, {
        filter: TX_NEEDS_BACKFILL,
        set: { amountMinor: paiseOf('$amount') },
        dryRun,
        batchSize: size,
        onProgress: onProgress && ((p) => onProgress({ collection: 'transactions', ...p })),
    });

    const users = await backfillCollection(User, {
        filter: USER_NEEDS_BACKFILL,
        set: { balanceMinor: paiseOf('$accountBalance') },
        dryRun,
        batchSize: size,
        onProgress: onProgress && ((p) => onProgress({ collection: 'users', ...p })),
    });

    return { dryRun, lifecycle, transactions, users };
};

/**
 * The verification pass §7.4 asks for before reads may flip.
 *
 * Three independent checks, because each catches a different failure:
 *
 *   - column parity: every `amountMinor` equals `round(amount * 100)` and every
 *     `balanceMinor` equals `round(accountBalance * 100)` — catches rows the
 *     backfill missed and any write path that stopped dual-writing;
 *   - minor ledger invariant: `balanceMinor == Σ credit amountMinor − Σ debit
 *     amountMinor` over the same settled rows the rupee reconciliation uses —
 *     this is the invariant reads will depend on after the flip, checked in
 *     integers, so it has no rounding tolerance at all;
 *   - the rupee invariant is `reconciliationService`'s job and not repeated.
 *
 * Read-only. `healthy` is the go/no-go signal for step 3.
 */
export const verifyMinorColumns = async ({ limit = 50 } = {}) => {
    const [lifecycleCount, txMismatchCount, userMismatchCount, txSamples, userSamples, ledgerDrift] = await Promise.all([
        Transaction.countDocuments(TX_NEEDS_LIFECYCLE),
        Transaction.countDocuments(TX_NEEDS_BACKFILL),
        User.countDocuments(USER_NEEDS_BACKFILL),
        Transaction.find(TX_NEEDS_BACKFILL).limit(Math.min(limit, 10)).select('_id amount amountMinor').lean(),
        User.find(USER_NEEDS_BACKFILL).limit(Math.min(limit, 10)).select('_id email accountBalance balanceMinor').lean(),
        User.aggregate([
            {
                $lookup: {
                    from: 'transactions',
                    localField: '_id',
                    foreignField: 'userId',
                    pipeline: [
                        { $match: SETTLED_MATCH },
                        {
                            $group: {
                                _id: null,
                                net: {
                                    $sum: {
                                        $cond: [
                                            { $eq: ['$type', 'Credit'] },
                                            { $ifNull: ['$amountMinor', 0] },
                                            { $multiply: [{ $ifNull: ['$amountMinor', 0] }, -1] },
                                        ],
                                    },
                                },
                            },
                        },
                    ],
                    as: 'ledger',
                },
            },
            {
                $project: {
                    email: 1,
                    balanceMinor: { $ifNull: ['$balanceMinor', 0] },
                    expectedMinor: { $ifNull: [{ $first: '$ledger.net' }, 0] },
                },
            },
            { $addFields: { driftMinor: { $subtract: ['$balanceMinor', '$expectedMinor'] } } },
            { $match: { driftMinor: { $ne: 0 } } },
            { $sort: { driftMinor: -1 } },
            { $limit: limit },
        ]).option({ allowDiskUse: true }),
    ]);

    return {
        generatedAt: new Date().toISOString(),
        healthy: lifecycleCount === 0 && txMismatchCount === 0 && userMismatchCount === 0 && ledgerDrift.length === 0,
        summary: {
            transactionsMissingLifecycle: lifecycleCount,
            transactionsMissingOrMismatched: txMismatchCount,
            usersMissingOrMismatched: userMismatchCount,
            accountsWithMinorLedgerDrift: ledgerDrift.length,
        },
        samples: { transactions: txSamples, users: userSamples },
        ledgerDrift,
    };
};

/**
 * The boot-time subset of `verifyMinorColumns`: only what the flipped reads
 * cannot compensate for. Users whose `balanceMinor` disagrees with
 * `accountBalance` would have payments refused (or, for a balance that was
 * over-stated, allowed) by the paise guard, and legacy rows with no lifecycle
 * fields are invisible to every `settlement`/`status` filter. A transaction
 * that merely lacks `amountMinor` is not counted — reads fall back for it.
 *
 * Read-only and cheap: two counts. `ready: false` means run
 * `npm run backfill:minor -- --apply`.
 */
export const checkMinorReadiness = async () => {
    const [usersMismatched, transactionsMissingLifecycle] = await Promise.all([
        User.countDocuments(USER_NEEDS_BACKFILL),
        Transaction.countDocuments(TX_NEEDS_LIFECYCLE),
    ]);
    return {
        ready: usersMismatched === 0 && transactionsMissingLifecycle === 0,
        usersMismatched,
        transactionsMissingLifecycle,
    };
};

export default { backfillMinorColumns, verifyMinorColumns, checkMinorReadiness };
