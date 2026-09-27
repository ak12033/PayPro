import mongoose from 'mongoose';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import { generateInvoiceId } from '../utils/generateInvoiceId.js';
import { toMoney, toPaise, fromPaise } from '../utils/money.js';
import { TX_SOURCE, TX_SETTLEMENT, TX_STATUS } from '../constants/transactionStatus.js';
import { AUDIT } from '../models/AuditLog.js';

/**
 * Single choke point for every balance mutation in the application.
 *
 * The previous implementation moved money like this:
 *
 *     const sender = await User.findById(a);
 *     const recipient = await User.findById(b);
 *     if (sender.accountBalance < amount) return error;
 *     ...
 *     sender.accountBalance -= amount;
 *     recipient.accountBalance += amount;
 *     await sender.save();
 *     await recipient.save();
 *
 * That has four independent defects:
 *
 *  1. LOST UPDATE. `save()` writes the whole document from a value read earlier.
 *     Two concurrent ₹800 transfers from a ₹1000 balance both read 1000, both
 *     pass the check, and both write 200 — the user spends ₹1600 they never had.
 *
 *  2. NON-ATOMIC PAIR. Four separate awaits with no transaction. A crash or a
 *     validation error between them leaves the debit applied and the credit
 *     lost (money destroyed), or two ledger rows with no balance change.
 *
 *  3. SELF-TRANSFER MINTS MONEY. When a === b, `sender` and `recipient` are two
 *     *different in-memory copies* of the same document. `sender.save()` writes
 *     balance-amount, then `recipient.save()` overwrites it with balance+amount.
 *     Net effect: the user's balance increases by the transfer amount, out of
 *     nothing, every single time.
 *
 *  4. TOCTOU OVERDRAFT. The balance check and the debit are separated by two
 *     network round trips to the AI service.
 *
 * Everything below instead expresses balance changes as a conditional atomic
 * `$inc`, so the guard and the mutation are one indivisible database operation,
 * and wraps multi-document work in a transaction.
 */

export class LedgerError extends Error {
    constructor(code, message, status = 400) {
        super(message);
        this.name = 'LedgerError';
        this.code = code;
        this.status = status;
    }
}

/**
 * MongoDB multi-document transactions require a replica set. Atlas always
 * provides one; a bare local `mongod` does not. We probe once and degrade to
 * sequential-with-compensation so local development still works.
 */
let transactionsSupported = null;

/**
 * Exported for services that must change a non-balance document in the same
 * transaction as a ledger write (Phase 5: a KYC decision and the tier it sets,
 * a withdrawal request and its hold). It moves no money itself.
 */
export const runInTransaction = async (work) => {
    if (transactionsSupported === false) {
        return work(null);
    }

    const session = await mongoose.startSession();
    try {
        let result;
        await session.withTransaction(async () => {
            result = await work(session);
        });
        transactionsSupported = true;
        return result;
    } catch (err) {
        const unsupported =
            err?.code === 20 ||
            /Transaction numbers are only allowed on a replica set|transactions are not supported/i.test(err?.message || '');

        if (unsupported && transactionsSupported === null) {
            transactionsSupported = false;
            // plan.md §29.2: a replica set is a hard production requirement, so
            // in production this is an error, not a warning. The logger is
            // imported lazily, and NODE_ENV read from process.env, for the
            // same reason as the lazy audit import in debitForRefund: this
            // module must not load config/env.js at import time.
            const { default: logger } = await import('../utils/logger.js');
            const level = process.env.NODE_ENV === 'production' ? 'error' : 'warn';
            logger[level](
                'MongoDB deployment does not support transactions (standalone server); ' +
                'falling back to compensated writes. Use a replica set or Atlas in production.'
            );
            return work(null);
        }
        throw err;
    } finally {
        await session.endSession();
    }
};

/**
 * Atomically decrease a balance, refusing to go negative.
 * Returns the updated user, or null when funds were insufficient.
 *
 * The guard is on `balanceMinor`, the integer source of truth (plan.md §7.4
 * step 3). Guarding on the rupee double refused real spends: after
 * `0.30 - 0.10` the stored balance is `0.19999999999999998`, which is not
 * `$gte` 0.20. `accountBalance` still moves in the same `$inc` — it is kept
 * written for one release as the rollback path — so the two can never observe
 * a partial update the way two separate writes could.
 */
export const debitWallet = async (userId, amount, session = null) => {
    const value = toMoney(amount);
    const minor = toPaise(value);
    return User.findOneAndUpdate(
        { _id: userId, balanceMinor: { $gte: minor } },
        { $inc: { accountBalance: -value, balanceMinor: -minor } },
        { new: true, session }
    );
};

/** Atomically increase a balance. Returns the updated user, or null if missing. */
export const creditWallet = async (userId, amount, session = null) => {
    const value = toMoney(amount);
    return User.findOneAndUpdate(
        { _id: userId },
        { $inc: { accountBalance: value, balanceMinor: toPaise(value) } },
        { new: true, session }
    );
};

/**
 * Create a ledger row, retrying on the (rare) invoiceId unique-index collision.
 *
 * `generateInvoiceId` is random, so collisions are possible. Previously a
 * collision threw a raw duplicate-key error — and in the transfer path it threw
 * *after* the sender had already been debited, destroying the money.
 */
export const createLedgerEntry = async (doc, session = null) => {
    for (let attempt = 0; attempt < 4; attempt++) {
        try {
            const [created] = await Transaction.create(
                [{ ...doc, amountMinor: toPaise(doc.amount), invoiceId: doc.invoiceId || generateInvoiceId() }],
                session ? { session } : {}
            );
            return created;
        } catch (err) {
            const isDuplicateInvoice =
                err?.code === 11000 && Object.keys(err?.keyPattern || {}).includes('invoiceId');
            if (!isDuplicateInvoice || attempt === 3) throw err;
            doc = { ...doc, invoiceId: undefined }; // force a fresh id next loop
        }
    }
    throw new LedgerError('INVOICE_ID', 'Could not allocate a unique invoice id', 500);
};

/**
 * Move money between two users atomically.
 *
 * Either both ledger rows exist and both balances moved, or nothing happened.
 */
export const transferFunds = async ({
    senderId,
    recipientId,
    amount,
    senderName,
    recipientName,
    risk = { risk_score: 0, risk_level: 'low', reason: '' }
}) => {
    const value = toMoney(amount);

    // Defect 3 above: a self-transfer is never legitimate and used to mint money.
    if (String(senderId) === String(recipientId)) {
        throw new LedgerError('SELF_TRANSFER', 'You cannot transfer money to yourself', 400);
    }

    const transferGroupId = new mongoose.Types.ObjectId().toString();

    return runInTransaction(async (session) => {
        // Conditional atomic debit: the balance check IS the write filter, so
        // there is no window between checking and spending.
        const sender = await debitWallet(senderId, value, session);
        if (!sender) {
            throw new LedgerError('INSUFFICIENT_FUNDS', 'Insufficient balance', 400);
        }

        const recipient = await creditWallet(recipientId, value, session);
        if (!recipient) {
            // Inside a transaction this rolls back; on the standalone fallback
            // path we compensate explicitly so the debit is never orphaned.
            if (!session) await creditWallet(senderId, value, null);
            throw new LedgerError('RECIPIENT_NOT_FOUND', 'Recipient not found', 404);
        }

        let senderTx;
        let recipientTx;
        try {
            senderTx = await createLedgerEntry({
                userId: sender._id,
                recipientId: recipient._id,
                description: `P2P transfer to ${recipientName}`,
                amount: value,
                type: 'Debit',
                category: 'Transfer',
                icon: 'Send',
                transferGroupId,
                source: TX_SOURCE.P2P,
                settlement: TX_SETTLEMENT.SETTLED,
                status: TX_STATUS.SUCCESS,
                categorySource: 'system',
                counterparty: { kind: 'user', userId: recipient._id, name: recipientName },
                riskScore: risk.risk_score,
                riskLevel: risk.risk_level,
                riskReason: risk.reason
            }, session);

            recipientTx = await createLedgerEntry({
                userId: recipient._id,
                recipientId: sender._id,
                description: `P2P transfer from ${senderName}`,
                amount: value,
                type: 'Credit',
                category: 'Transfer',
                icon: 'Download',
                transferGroupId,
                source: TX_SOURCE.P2P,
                settlement: TX_SETTLEMENT.SETTLED,
                status: TX_STATUS.SUCCESS,
                categorySource: 'system',
                counterparty: { kind: 'user', userId: sender._id, name: senderName },
                riskScore: 0,
                riskLevel: 'low',
                riskReason: 'Incoming transfer'
            }, session);
        } catch (err) {
            if (!session) {
                // Compensate both legs on the non-transactional fallback path.
                await creditWallet(senderId, value, null);
                await debitWallet(recipientId, value, null);
                if (senderTx) await Transaction.deleteOne({ _id: senderTx._id });
            }
            throw err;
        }

        return {
            sender,
            recipient,
            senderTx,
            recipientTx,
            transferGroupId
        };
    });
};

/**
 * Credit a wallet from an external payment (Razorpay capture) and settle the
 * matching ledger row, atomically.
 *
 * `pendingTransactionId` — when the order was created via
 * `createOrder`/`paymentController`, a PENDING row already exists for it, so a
 * top-up is visible in Activity from the moment the user starts checkout, not
 * only once it captures. That row is transitioned to SUCCESS here rather than
 * writing a second one. Its absence (an older Payment predating this field, or
 * a caller that never created one) falls back to writing a fresh SUCCESS row,
 * so this function still works standalone.
 */
export const creditFromPayment = async ({ userId, amount, description, paymentRef, pendingTransactionId = null }) => {
    const value = toMoney(amount);

    return runInTransaction(async (session) => {
        const user = await creditWallet(userId, value, session);
        if (!user) throw new LedgerError('USER_NOT_FOUND', 'User not found', 404);

        let transaction = null;

        if (pendingTransactionId) {
            transaction = await Transaction.findOneAndUpdate(
                { _id: pendingTransactionId, status: TX_STATUS.PENDING },
                {
                    $set: { status: TX_STATUS.SUCCESS, amount: value, amountMinor: toPaise(value), description },
                    $push: {
                        statusHistory: {
                            from: TX_STATUS.PENDING, to: TX_STATUS.SUCCESS,
                            at: new Date(), reason: 'Payment captured', actor: 'system',
                        },
                    },
                },
                { new: true, session }
            );
        }

        if (!transaction) {
            transaction = await createLedgerEntry({
                userId: user._id,
                description,
                amount: value,
                type: 'Credit',
                category: 'Top Up',
                icon: 'Wallet',
                paymentRef,
                source: TX_SOURCE.TOPUP,
                settlement: TX_SETTLEMENT.SETTLED,
                status: TX_STATUS.SUCCESS,
                categorySource: 'system',
            }, session);
        }

        return { user, transaction };
    });
};

/**
 * How far below zero a balance sits, in paise. Zero for any non-negative
 * balance. Derived, never stored: a stored "amount owed" is a second copy of
 * the balance that would have to be kept in step with every credit.
 */
export const overdraftMinorFor = (balance) => (balance < 0 ? toPaise(-balance) : 0);

/**
 * Debit a wallet when a refund is processed, and write the matching ledger row.
 *
 * `allowNegative` exists because a gateway-initiated refund must be reflected
 * even if the user has already spent the money — refusing would desynchronise
 * our ledger from Razorpay's.
 *
 * That makes this the one path in the codebase that can take a balance below
 * zero, and it now does so explicitly rather than by accident (plan.md §4.4).
 * It used to rely on the schema's `min: 0` validator, which Mongoose never runs
 * on `$inc` — so the balance went negative silently while the model claimed it
 * could not. Now:
 *
 *   - the returned `overdraft` says whether this refund crossed zero and by how
 *     much, so the caller can tell the user;
 *   - crossing zero writes a `wallet.overdraft` audit entry, once, on the
 *     transition — not again for a second refund on an already-negative
 *     balance, which is not a new event;
 *   - the reversal row records `overdraftMinor`, so the ledger itself explains
 *     the negative balance.
 *
 * An overdrawn account can still receive money, and a top-up clears it
 * naturally. It cannot spend: `debitWallet`'s `$gte` filter refuses every
 * debit while the balance is below the amount.
 */
export const debitForRefund = async ({ userId, amount, description, paymentRef, allowNegative = true }) => {
    const value = toMoney(amount);

    const result = await runInTransaction(async (session) => {
        const user = allowNegative
            ? await User.findOneAndUpdate(
                { _id: userId },
                { $inc: { accountBalance: -value, balanceMinor: -toPaise(value) } },
                { new: true, session }
            )
            : await debitWallet(userId, value, session);

        if (!user) throw new LedgerError('INSUFFICIENT_FUNDS', 'Insufficient balance to process refund', 400);

        const balanceAfterMinor = user.balanceMinor;
        const balanceBeforeMinor = balanceAfterMinor + toPaise(value);
        const overdraft = {
            crossedZero: balanceBeforeMinor >= 0 && balanceAfterMinor < 0,
            overdraftMinor: balanceAfterMinor < 0 ? -balanceAfterMinor : 0,
        };

        const transaction = await createLedgerEntry({
            userId: user._id,
            description,
            amount: value,
            type: 'Debit',
            category: 'Refund',
            icon: 'RefreshCcw',
            paymentRef,
            source: TX_SOURCE.REFUND,
            settlement: TX_SETTLEMENT.SETTLED,
            status: TX_STATUS.SUCCESS,
            categorySource: 'system',
            ...(overdraft.overdraftMinor > 0 && { overdraftMinor: overdraft.overdraftMinor }),
        }, session);

        /**
         * Mark the original top-up REFUNDED so its own row's status reflects
         * reality, without mutating its amount or description — the reversal
         * above is the auditable record of what actually happened to the
         * money. Best-effort: an order predating this field, or one whose
         * pending row was never settled through `creditFromPayment`, simply
         * has nothing to update.
         */
        if (paymentRef) {
            await Transaction.findOneAndUpdate(
                { paymentRef, category: 'Top Up', status: TX_STATUS.SUCCESS },
                {
                    $set: { status: TX_STATUS.REFUNDED },
                    $push: {
                        statusHistory: {
                            from: TX_STATUS.SUCCESS, to: TX_STATUS.REFUNDED,
                            at: new Date(), reason: 'Refund processed', actor: 'system',
                        },
                    },
                },
                { session }
            );
        }

        return { user, transaction, overdraft };
    });

    // After the transaction commits, never inside it: an audit row for an
    // overdraft that then rolled back would describe something that never
    // happened.
    if (result.overdraft.crossedZero) {
        /**
         * Imported here, not at the top of the file. `auditService` pulls in
         * `utils/logger.js` and therefore `config/env.js`, which snapshots
         * `process.env` on first import (context.md §9). This module is
         * statically imported by test files that set env vars *before* their
         * dynamic app import — a top-level import here loaded the config early
         * and silently broke their webhook-signature tests. The ledger has
         * never needed config to load, and should not start now.
         */
        const { audit } = await import('./auditService.js');
        audit(AUDIT.WALLET_OVERDRAFT, {
            userId: result.user._id,
            target: { type: 'Transaction', id: String(result.transaction._id) },
            metadata: {
                overdraftMinor: result.overdraft.overdraftMinor,
                refundAmount: value,
                paymentRef: paymentRef ?? null,
            },
        });
    }

    return result;
};

/**
 * An operator credit or debit (plan.md §28.2 "Manual adjustments").
 *
 * §28.3 rule 2 is the reason this lives here and not in the admin controller:
 * no admin endpoint writes a balance directly. The adjustment is a real,
 * settled ledger row with `source: 'adjustment'`, so reconciliation sums it like
 * any other movement and the account holder sees it in Activity.
 *
 * A debit is guarded exactly like spending — `debitWallet`'s `$gte` filter —
 * so an adjustment can never be the second path below zero. Taking back money
 * the user no longer has is a collections decision, not something a console
 * button should be able to do by accident.
 */
export const applyAdjustment = async ({ userId, amount, type, reason, actorId }) => {
    const value = toMoney(amount);
    if (!(value > 0)) throw new LedgerError('INVALID_AMOUNT', 'Adjustment amount must be positive', 400);
    if (!['Credit', 'Debit'].includes(type)) throw new LedgerError('INVALID_TYPE', 'Adjustment type must be Credit or Debit', 400);

    return runInTransaction(async (session) => {
        // Checked separately so a missing account is not reported as a short balance.
        const exists = await User.exists({ _id: userId }).session(session);
        if (!exists) throw new LedgerError('USER_NOT_FOUND', 'User not found', 404);

        const user = type === 'Credit'
            ? await creditWallet(userId, value, session)
            : await debitWallet(userId, value, session);
        if (!user) throw new LedgerError('INSUFFICIENT_FUNDS', 'The balance is lower than this debit', 400);

        let transaction;
        try {
            transaction = await createLedgerEntry({
                userId: user._id,
                description: type === 'Credit' ? 'Balance adjustment (credit)' : 'Balance adjustment (debit)',
                amount: value,
                type,
                category: 'Adjustment',
                icon: 'Scale',
                source: TX_SOURCE.ADJUSTMENT,
                settlement: TX_SETTLEMENT.SETTLED,
                status: TX_STATUS.SUCCESS,
                categorySource: 'system',
                adjustment: {
                    kind: 'manual',
                    reason,
                    actorId,
                    previousBalance: fromPaise(user.balanceMinor + (type === 'Credit' ? -1 : 1) * toPaise(value)),
                    correctedBalance: fromPaise(user.balanceMinor),
                },
            }, session);
        } catch (err) {
            if (!session) {
                if (type === 'Credit') await debitWallet(userId, value, null);
                else await creditWallet(userId, value, null);
            }
            throw err;
        }

        return { user, transaction };
    });
};

// ---------------------------------------------------------------------------
// Holds (Phase 5): withdrawals and bill payments
// ---------------------------------------------------------------------------

/**
 * Take money out of the wallet for a payment that completes later.
 *
 * The debit happens *now*, under the same `$gte` guard as any spend, so money
 * waiting on an operator's bank transfer or a biller's confirmation cannot also
 * be spent or withdrawn a second time. The row is written PENDING, and because
 * its source is a hold source it already counts toward the balance
 * (`BALANCE_MATCH` in constants/transactionStatus.js) — the ledger and the
 * wallet agree at every step, not only once the payment settles.
 *
 * `source` must be one of `HOLD_SOURCES`. Nothing else may leave a PENDING row
 * behind a balance change, or reconciliation would report it as drift.
 */
export const holdFunds = async ({ userId, amount, source, category, icon, description, counterparty, extra = {}, session: outer = null }) => {
    const value = toMoney(amount);
    if (!(value > 0)) throw new LedgerError('INVALID_AMOUNT', 'Amount must be positive', 400);
    if (![TX_SOURCE.WITHDRAWAL, TX_SOURCE.BILL].includes(source)) {
        throw new LedgerError('INVALID_SOURCE', `Source "${source}" cannot hold funds`, 500);
    }

    const work = async (session) => {
        const user = await debitWallet(userId, value, session);
        if (!user) throw new LedgerError('INSUFFICIENT_FUNDS', 'Insufficient balance', 400);

        let transaction;
        try {
            transaction = await createLedgerEntry({
                userId: user._id,
                description,
                amount: value,
                type: 'Debit',
                category,
                icon,
                source,
                settlement: TX_SETTLEMENT.SETTLED,
                status: TX_STATUS.PENDING,
                categorySource: 'system',
                counterparty,
                statusHistory: [{ from: null, to: TX_STATUS.PENDING, at: new Date(), reason: 'Funds held', actor: 'system' }],
                ...extra,
            }, session);
        } catch (err) {
            if (!session) await creditWallet(userId, value, null);
            throw err;
        }

        return { user, transaction };
    };

    return outer ? work(outer) : runInTransaction(work);
};

/**
 * Move a held row forward without touching the balance: PENDING → PROCESSING
 * (an operator has started the bank transfer) or → SUCCESS (the money left).
 * The money already left the wallet at `holdFunds`, so only the status moves.
 *
 * A compare-and-set on the current status, like every other settle-once path
 * (context.md §5.2): a second, concurrent "mark paid" matches nothing.
 */
export const advanceHold = async ({ transactionId, from, to, reason, actor = 'system', set = {}, session = null }) => {
    const allowed = {
        [TX_STATUS.PENDING]: [TX_STATUS.PROCESSING, TX_STATUS.SUCCESS],
        [TX_STATUS.PROCESSING]: [TX_STATUS.SUCCESS],
    };
    const fromList = Array.isArray(from) ? from : [from];
    if (!fromList.every((f) => allowed[f]?.includes(to))) {
        throw new LedgerError('INVALID_TRANSITION', `Cannot move a held payment from ${fromList.join('/')} to ${to}`, 409);
    }

    const current = await Transaction.findOne({ _id: transactionId, status: { $in: fromList } }).select('status').session(session);
    if (!current) throw new LedgerError('INVALID_TRANSITION', 'This payment has already moved on', 409);

    const updated = await Transaction.findOneAndUpdate(
        { _id: transactionId, status: current.status },
        {
            $set: { status: to, ...set },
            $push: { statusHistory: { from: current.status, to, at: new Date(), reason, actor } },
        },
        { new: true, session }
    );
    if (!updated) throw new LedgerError('INVALID_TRANSITION', 'This payment changed status concurrently; please retry', 409);
    return updated;
};

/**
 * Give held money back: the payment was rejected, cancelled or failed.
 *
 * The row moves to FAILED or CANCELLED *and* the wallet is credited, in one
 * transaction. The status filter is the claim — whoever moves the row out of
 * PENDING/PROCESSING is the one who credits — so a double-clicked "reject", or a
 * reject racing a user's cancel, returns the money exactly once.
 *
 * Why the row changes status instead of a second "reversal" row being written:
 * a FAILED row leaves `BALANCE_MATCH` at the same moment its money comes back,
 * so reconciliation stays exact, and analytics (which count only SUCCESS rows)
 * see neither the failed debit nor a phantom credit. A separate reversal Credit
 * would be SUCCESS and would be counted as money in. The history of the hold is
 * kept on the row's `statusHistory` and in the audit trail.
 */
export const releaseHold = async ({ transactionId, to, reason, actor = 'system', failureReason, session: outer = null }) => {
    if (![TX_STATUS.FAILED, TX_STATUS.CANCELLED].includes(to)) {
        throw new LedgerError('INVALID_TRANSITION', 'A hold can only be released as FAILED or CANCELLED', 500);
    }

    const work = async (session) => {
        const current = await Transaction.findOne({
            _id: transactionId,
            source: { $in: [TX_SOURCE.WITHDRAWAL, TX_SOURCE.BILL] },
            status: { $in: [TX_STATUS.PENDING, TX_STATUS.PROCESSING] },
        }).session(session);
        if (!current) throw new LedgerError('INVALID_TRANSITION', 'This payment is no longer held', 409);

        const updated = await Transaction.findOneAndUpdate(
            { _id: transactionId, status: current.status },
            {
                $set: { status: to, ...(failureReason && { failureReason }) },
                $push: { statusHistory: { from: current.status, to, at: new Date(), reason, actor } },
            },
            { new: true, session }
        );
        if (!updated) throw new LedgerError('INVALID_TRANSITION', 'This payment changed status concurrently; please retry', 409);

        const user = await creditWallet(current.userId, fromPaise(current.amountMinor ?? toPaise(current.amount)), session);
        if (!user) throw new LedgerError('USER_NOT_FOUND', 'User not found', 404);

        return { user, transaction: updated };
    };

    return outer ? work(outer) : runInTransaction(work);
};

/**
 * Record a manual (self-reported) ledger note.
 *
 * This is bookkeeping, not money movement: the user is describing spending
 * that happened outside PayPro, so `accountBalance` must never be touched by
 * it. It previously called `debitWallet`/`creditWallet` like every other write
 * path here, which meant posting `{type: "income", amount: 999999}` minted
 * spendable balance for money that never moved — the row and the wallet must
 * stay decoupled for exactly that reason. `settlement: 'none'` is what every
 * balance and reconciliation query filters on to exclude rows like this one.
 */
export const applyManualTransaction = async ({ userId, description, amount, type, category, icon, categorySource = 'ai', risk }) => {
    const value = toMoney(amount);

    const user = await User.findById(userId).select('accountBalance balanceMinor');
    if (!user) {
        throw new LedgerError('USER_NOT_FOUND', 'User not found', 404);
    }

    const transaction = await createLedgerEntry({
        userId: user._id,
        description,
        amount: value,
        type,
        category,
        icon,
        source: TX_SOURCE.MANUAL,
        settlement: TX_SETTLEMENT.NONE,
        status: TX_STATUS.SUCCESS,
        categorySource,
        riskScore: risk?.risk_score ?? 0,
        riskLevel: risk?.risk_level ?? 'low',
        riskReason: risk?.reason ?? ''
    });

    return { user, transaction };
};
