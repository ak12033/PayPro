import mongoose from 'mongoose';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import { generateInvoiceId } from '../utils/generateInvoiceId.js';
import { toMoney } from '../utils/money.js';

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

const runInTransaction = async (work) => {
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
            console.warn(
                '⚠️  MongoDB deployment does not support transactions (standalone server). ' +
                'Falling back to compensated writes. Use a replica set or Atlas in production.'
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
 */
export const debitWallet = async (userId, amount, session = null) => {
    const value = toMoney(amount);
    return User.findOneAndUpdate(
        { _id: userId, accountBalance: { $gte: value } },
        { $inc: { accountBalance: -value } },
        { new: true, session }
    );
};

/** Atomically increase a balance. Returns the updated user, or null if missing. */
export const creditWallet = async (userId, amount, session = null) => {
    const value = toMoney(amount);
    return User.findOneAndUpdate(
        { _id: userId },
        { $inc: { accountBalance: value } },
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
                [{ ...doc, invoiceId: doc.invoiceId || generateInvoiceId() }],
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
 * Credit a wallet from an external payment (Razorpay capture) and write the
 * matching ledger row, atomically.
 */
export const creditFromPayment = async ({ userId, amount, description, paymentRef }) => {
    const value = toMoney(amount);

    return runInTransaction(async (session) => {
        const user = await creditWallet(userId, value, session);
        if (!user) throw new LedgerError('USER_NOT_FOUND', 'User not found', 404);

        const transaction = await createLedgerEntry({
            userId: user._id,
            description,
            amount: value,
            type: 'Credit',
            category: 'Top Up',
            icon: 'Wallet',
            paymentRef
        }, session);

        return { user, transaction };
    });
};

/**
 * Debit a wallet when a refund is processed, and write the matching ledger row.
 * `allowNegative` exists because a gateway-initiated refund must be reflected
 * even if the user has already spent the money — refusing would desynchronise
 * our ledger from Razorpay's.
 */
export const debitForRefund = async ({ userId, amount, description, paymentRef, allowNegative = true }) => {
    const value = toMoney(amount);

    return runInTransaction(async (session) => {
        const user = allowNegative
            ? await User.findOneAndUpdate(
                { _id: userId },
                { $inc: { accountBalance: -value } },
                { new: true, session }
            )
            : await debitWallet(userId, value, session);

        if (!user) throw new LedgerError('INSUFFICIENT_FUNDS', 'Insufficient balance to process refund', 400);

        const transaction = await createLedgerEntry({
            userId: user._id,
            description,
            amount: value,
            type: 'Debit',
            category: 'Refund',
            icon: 'RefreshCcw',
            paymentRef
        }, session);

        return { user, transaction };
    });
};

/**
 * Apply a manual (self-recorded) transaction. Debits are balance-guarded.
 */
export const applyManualTransaction = async ({ userId, description, amount, type, category, icon, risk }) => {
    const value = toMoney(amount);

    return runInTransaction(async (session) => {
        const user = type === 'Debit'
            ? await debitWallet(userId, value, session)
            : await creditWallet(userId, value, session);

        if (!user) {
            throw new LedgerError(
                type === 'Debit' ? 'INSUFFICIENT_FUNDS' : 'USER_NOT_FOUND',
                type === 'Debit' ? 'Insufficient balance' : 'User not found',
                type === 'Debit' ? 400 : 404
            );
        }

        const transaction = await createLedgerEntry({
            userId: user._id,
            description,
            amount: value,
            type,
            category,
            icon,
            riskScore: risk?.risk_score ?? 0,
            riskLevel: risk?.risk_level ?? 'low',
            riskReason: risk?.reason ?? ''
        }, session);

        return { user, transaction };
    });
};
