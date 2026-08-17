import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import Otp, { OTP_TTL_MS } from '../models/Otp.js';
import { categorizeTransaction, checkFraud, getInsights, getAssistantResponse } from '../utils/fastapiClient.js';
import sendOtp from '../utils/sendOtp.js';
import { notifyUser } from '../services/notificationService.js';
import { emitToUser } from '../utils/socket.js';
import {
    transferFunds,
    applyManualTransaction,
    LedgerError
} from '../services/ledgerService.js';
import { parseAmount } from '../utils/money.js';
import { asString, asObjectId, asInt, asEnum, escapeRegex } from '../utils/sanitize.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { audit } from '../services/auditService.js';
import { AUDIT } from '../models/AuditLog.js';
import logger from '../utils/logger.js';

const TRANSFER_2FA_THRESHOLD = 5; // transfers to the same recipient per day
const OTP_BCRYPT_ROUNDS = 10;

/**
 * Categories a user may pick by hand on the Add Transaction form, and the icon
 * each maps to. Anything outside this list falls through to AI categorisation.
 * Kept in sync with the options rendered by the client.
 */
export const MANUAL_CATEGORIES = [
    'General', 'Food', 'Transport', 'Bills', 'Shopping', 'Health',
    'Groceries', 'Entertainment', 'Education', 'Rent', 'Travel', 'Others'
];

const CATEGORY_ICONS = {
    General: 'CircleDollarSign',
    Food: 'Utensils',
    Transport: 'Car',
    Bills: 'Receipt',
    Shopping: 'ShoppingBag',
    Health: 'HeartPulse',
    Groceries: 'ShoppingCart',
    Entertainment: 'Tv',
    Education: 'GraduationCap',
    Rent: 'Home',
    Travel: 'Plane',
    Others: 'CircleDollarSign',
};

/** How many transfers this sender has made to this recipient since midnight. */
const dailyTransferCount = async (senderId, recipientId) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    return Transaction.countDocuments({
        userId: senderId,
        recipientId,
        type: 'Debit',
        category: 'Transfer',
        createdAt: { $gte: startOfDay }
    });
};

/**
 * Issue a transfer-scoped OTP whose context is pinned to the exact recipient
 * and amount being authorised.
 *
 * Previously the pending transfer was held in the browser's localStorage and
 * replayed to the server after OTP verification — so a user could approve a
 * ₹100 transfer by email, then edit localStorage and send ₹100,000, because the
 * server never checked that the verified challenge matched the executed
 * transfer.
 */
export const issueTransferChallenge = async (sender, recipientId, amount) => {
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpHash = await bcrypt.hash(otp, OTP_BCRYPT_ROUNDS);

    // Only one live transfer challenge per user at a time.
    await Otp.deleteMany({ email: sender.email, purpose: 'transfer' });

    const record = await Otp.create({
        email: sender.email,
        otpHash,
        purpose: 'transfer',
        context: { recipientId: String(recipientId), amount },
        expiry: new Date(Date.now() + OTP_TTL_MS)
    });

    // Email delivery must not block or fail the API response.
    sendOtp(sender.email, otp, 'transfer').catch((err) =>
        console.error('Transfer OTP delivery failed:', err.message)
    );

    return record;
};

export const addTransaction = asyncHandler(async (req, res) => {
    const description = asString(req.body?.description, { maxLength: 280 });
    if (!description) {
        return res.status(400).json({ message: 'Description is required' });
    }

    const parsed = parseAmount(req.body?.amount);
    if (!parsed.ok) {
        return res.status(400).json({ message: parsed.error });
    }

    /**
     * The client sends 'expense'/'income'. Reject anything unrecognised rather
     * than defaulting: the old code treated every non-'Debit' value as a
     * Credit, so posting `type: "anything"` minted balance out of nothing.
     */
    const rawType = asString(req.body?.type) || 'Debit';
    const typeMap = {
        expense: 'Debit', debit: 'Debit', Debit: 'Debit',
        income: 'Credit', credit: 'Credit', Credit: 'Credit'
    };
    const type = typeMap[rawType];
    if (!type) {
        return res.status(400).json({ message: 'Type must be one of: expense, income' });
    }

    const amount = parsed.value;

    // Cheap pre-check so we can fail fast before paying for two AI calls. The
    // authoritative, race-free check happens inside the ledger service.
    if (type === 'Debit') {
        const user = await User.findById(req.user.id).select('accountBalance');
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (user.accountBalance < amount) {
            return res.status(400).json({ message: 'Insufficient balance' });
        }
    }

    const history = await Transaction.find({ userId: req.user.id })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('description amount type category createdAt -_id')
        .lean();

    /**
     * Honour an explicitly chosen category.
     *
     * The Add Transaction form has always had a category dropdown and has
     * always posted the selected value — but the server discarded it and used
     * whatever Gemini returned instead. A user who picked "Food" could watch
     * their transaction get filed under "Shopping", with no way to correct it.
     *
     * When the user picks one we skip the categorisation call entirely, which
     * also removes a Gemini round trip from the request.
     */
    const chosenCategory = asEnum(req.body?.category, MANUAL_CATEGORIES);

    const [aiCategoryData, fraudResult] = await Promise.all([
        // These two AI calls are independent. Running them sequentially
        // previously doubled the user-visible latency of every transaction.
        chosenCategory
            ? Promise.resolve({ category: chosenCategory, icon: CATEGORY_ICONS[chosenCategory] })
            : categorizeTransaction(description, amount),
        checkFraud({ description, amount, type, category: chosenCategory }, history)
    ]);

    let result;
    try {
        result = await applyManualTransaction({
            userId: req.user.id,
            description,
            amount,
            type,
            category: aiCategoryData.category,
            icon: aiCategoryData.icon,
            risk: fraudResult
        });
    } catch (err) {
        if (err instanceof LedgerError) {
            return res.status(err.status).json({ message: err.message });
        }
        throw err;
    }

    const { user, transaction } = result;

    emitToUser(user._id.toString(), 'wallet_update', {
        newBalance: user.accountBalance,
        transaction
    });

    audit(AUDIT.TRANSACTION_ADDED, {
        userId: user._id, req,
        target: { type: 'Transaction', id: String(transaction._id) },
        metadata: { amount, type, category: transaction.category }
    });

    if (fraudResult.risk_level === 'high') {
        audit(AUDIT.HIGH_RISK_FLAGGED, {
            userId: req.user.id, req,
            target: { type: 'Transaction', id: String(transaction._id) },
            metadata: { amount, riskScore: fraudResult.risk_score, reason: fraudResult.reason }
        });
        await notifyUser(
            req.user.id,
            'Security',
            'High Risk Transaction Detected',
            `A recent transaction of ₹${amount} for "${description}" was flagged as high risk. Please review your account.`,
            { amount, transactionId: transaction._id.toString() }
        );
    }

    res.status(201).json({
        message: 'Transaction added successfully',
        transaction,
        balance: user.accountBalance
    });
});

export const getPaginatedTransactions = asyncHandler(async (req, res) => {
    const page = asInt(req.query.page, { min: 1, max: 100000, fallback: 1 });
    const limit = asInt(req.query.limit, { min: 1, max: 100, fallback: 10 });

    const query = { userId: new mongoose.Types.ObjectId(req.user.id) };

    /**
     * Every filter below is allow-listed or coerced to a primitive. Passing
     * req.query values straight into a Mongoose filter let a caller send
     * `?type[$ne]=Debit` and rewrite the query's meaning.
     */
    const search = asString(req.query.search, { maxLength: 100 });
    if (search) {
        // Escaped: an unescaped user regex is both a ReDoS vector and a way to
        // widen the filter (e.g. `.*`).
        query.description = { $regex: escapeRegex(search), $options: 'i' };
    }

    const type = asEnum(req.query.type, ['Credit', 'Debit']);
    if (type) query.type = type;

    const category = asString(req.query.category, { maxLength: 60 });
    if (category) query.category = category;

    /**
     * Named presets for the history page's filter chips.
     *
     * The UI has always sent `?filter=Transfer|Received|Payment|All`, but no
     * version of this handler ever read a `filter` parameter — it only looked
     * at `type` and `category`. The chips therefore did nothing at all: every
     * one of them returned the identical unfiltered list, and the "Current
     * filter" label on the page reported a filter that was never applied.
     *
     * Presets are resolved server-side so the meaning of "Payment" lives in one
     * place rather than being re-derived by each client.
     */
    const PRESETS = {
        Transfer: { type: 'Debit', category: 'Transfer' },
        Received: { type: 'Credit', category: 'Transfer' },
        TopUp: { type: 'Credit', category: { $in: ['Top Up', 'Stripe'] } },
        Payment: { type: 'Debit', category: { $nin: ['Transfer', 'Refund'] } },
        Refund: { category: 'Refund' },
    };

    const preset = asEnum(req.query.filter, Object.keys(PRESETS));
    if (preset) {
        // Explicit `type`/`category` params win over the preset.
        for (const [key, value] of Object.entries(PRESETS[preset])) {
            if (query[key] === undefined) query[key] = value;
        }
    }

    const minAmount = req.query.minAmount !== undefined ? Number(req.query.minAmount) : NaN;
    const maxAmount = req.query.maxAmount !== undefined ? Number(req.query.maxAmount) : NaN;
    if (Number.isFinite(minAmount) || Number.isFinite(maxAmount)) {
        query.amount = {};
        if (Number.isFinite(minAmount)) query.amount.$gte = minAmount;
        if (Number.isFinite(maxAmount)) query.amount.$lte = maxAmount;
    }

    const start = asString(req.query.startDate) ? new Date(req.query.startDate) : null;
    const end = asString(req.query.endDate) ? new Date(req.query.endDate) : null;
    const validStart = start && !Number.isNaN(start.getTime());
    const validEnd = end && !Number.isNaN(end.getTime());
    if (validStart || validEnd) {
        query.createdAt = {};
        if (validStart) query.createdAt.$gte = start;
        if (validEnd) query.createdAt.$lte = end;
    }

    // Allow-listed sort fields: an arbitrary `sortBy` lets a caller sort on an
    // unindexed field and force an in-memory sort of the whole collection.
    const sortBy = asEnum(req.query.sortBy, ['createdAt', 'amount'], 'createdAt');
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    const [transactions, total] = await Promise.all([
        Transaction.find(query)
            .sort({ [sortBy]: sortOrder })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        Transaction.countDocuments(query)
    ]);

    res.status(200).json({
        transactions,
        total,
        currentPage: page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    });
});

export const getAiInsights = asyncHandler(async (req, res) => {
    const transactions = await Transaction.find({ userId: req.user.id })
        .sort({ createdAt: -1 })
        .limit(50)
        .select('description amount type category createdAt -_id')
        .lean();

    const insights = await getInsights(transactions);
    res.status(200).json({ insights });
});

export const askAiAssistant = asyncHandler(async (req, res) => {
    const query = asString(req.body?.query, { maxLength: 2000 });
    if (!query) return res.status(400).json({ message: 'Query is required' });

    const transactions = await Transaction.find({ userId: req.user.id })
        .sort({ createdAt: -1 })
        .limit(20)
        .select('description amount type category createdAt -_id')
        .lean();

    const response = await getAssistantResponse(query, transactions);
    res.status(200).json({ response });
});

/**
 * Shared execution path for both the direct and the OTP-verified transfer.
 * Returns `{ error, status }` for expected business failures.
 */
export const executeTransfer = async ({ sender, recipient, amount, idempotencyKey }) => {
    const history = await Transaction.find({ userId: sender._id })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('description amount type category createdAt -_id')
        .lean();

    const fraudResult = await checkFraud({
        description: `P2P transfer to ${recipient.firstName}`,
        amount,
        type: 'Debit',
        category: 'Transfer'
    }, history);

    let outcome;
    try {
        outcome = await transferFunds({
            senderId: sender._id,
            recipientId: recipient._id,
            amount,
            senderName: sender.firstName,
            recipientName: recipient.firstName,
            risk: fraudResult
        });
    } catch (err) {
        if (err instanceof LedgerError) {
            return { error: err.message, status: err.status };
        }
        throw err;
    }

    const { senderTx, recipientTx } = outcome;

    if (idempotencyKey) {
        // A duplicate-key rejection here is benign: the transfer itself settled.
        await Transaction.updateOne({ _id: senderTx._id }, { $set: { idempotencyKey } })
            .catch(() => {});
    }

    emitToUser(outcome.sender._id.toString(), 'wallet_update', {
        newBalance: outcome.sender.accountBalance,
        transaction: senderTx
    });
    emitToUser(outcome.recipient._id.toString(), 'wallet_update', {
        newBalance: outcome.recipient.accountBalance,
        transaction: recipientTx
    });

    // Notifications are best-effort and must never roll back a settled transfer.
    Promise.all([
        notifyUser(
            outcome.sender._id,
            'Transfer',
            'Transfer Successful',
            `You successfully sent ₹${amount} to ${recipient.firstName}.`,
            { amount, recipient: recipient.firstName }
        ),
        notifyUser(
            outcome.recipient._id,
            'Transfer',
            'Money Received',
            `You received ₹${amount} from ${sender.firstName}.`,
            { amount, sender: sender.firstName }
        ),
        fraudResult.risk_level === 'high'
            ? notifyUser(
                outcome.sender._id,
                'Security',
                'High Risk Transfer Detected',
                `Your recent transfer of ₹${amount} to ${recipient.firstName} was flagged as unusual.`,
                { amount }
            )
            : Promise.resolve()
    ]).catch((err) => console.error('Post-transfer notification error:', err.message));

    return outcome;
};

export const sendMoney = asyncHandler(async (req, res) => {
    const recipientId = asObjectId(req.body?.recipientId);
    if (!recipientId) {
        // Previously an invalid id reached `User.findById()` and threw a
        // CastError, surfacing to the user as an opaque 500.
        return res.status(400).json({ message: 'A valid recipient is required' });
    }

    const parsed = parseAmount(req.body?.amount);
    if (!parsed.ok) {
        return res.status(400).json({ message: parsed.error });
    }
    const amount = parsed.value;
    const idempotencyKey = asString(req.body?.idempotencyKey, { maxLength: 100 });

    if (String(recipientId) === String(req.user.id)) {
        return res.status(400).json({ message: 'You cannot transfer money to yourself' });
    }

    const [sender, recipient] = await Promise.all([
        User.findById(req.user.id).select('firstName email accountBalance preferences'),
        User.findById(recipientId).select('firstName')
    ]);

    if (!sender) return res.status(404).json({ message: 'User not found' });
    if (!recipient) return res.status(404).json({ message: 'Recipient not found' });

    if (sender.accountBalance < amount) {
        return res.status(400).json({ message: 'Insufficient balance' });
    }

    // Replay guard: a double-clicked button, or an axios retry after a network
    // timeout, previously produced two genuine transfers.
    if (idempotencyKey) {
        const existing = await Transaction.findOne({ idempotencyKey, userId: sender._id }).lean();
        if (existing) {
            return res.status(200).json({
                message: 'Transfer already processed',
                duplicate: true,
                senderTransactionId: existing._id
            });
        }
    }

    /**
     * 2FA gate.
     *
     * The previous implementation read `skip2FA` straight out of the request
     * body, so any client bypassed the entire challenge by posting
     * `{"skip2FA": true}` on the first request. The decision is now made
     * exclusively server-side, and the only route that can complete a
     * challenged transfer is `verifyTransferOtp`.
     */
    const requires2FA =
        sender.preferences?.transaction2FA !== false &&
        (await dailyTransferCount(sender._id, recipientId)) >= TRANSFER_2FA_THRESHOLD;

    if (requires2FA) {
        await issueTransferChallenge(sender, recipientId, amount);
        audit(AUDIT.TRANSFER_2FA_REQUIRED, {
            userId: sender._id, req, target: { type: 'User', id: String(recipientId) },
            metadata: { amount }
        });
        return res.status(403).json({
            message: `2FA Required: An OTP has been sent to ${sender.email}`,
            require2FA: true,
            email: sender.email,
        });
    }

    const result = await executeTransfer({ sender, recipient, amount, idempotencyKey });
    if (result.error) {
        audit(AUDIT.TRANSFER_FAILED, {
            userId: sender._id, outcome: 'failure', req,
            target: { type: 'User', id: String(recipientId) },
            metadata: { amount, reason: result.error }
        });
        return res.status(result.status).json({ message: result.error });
    }

    audit(AUDIT.TRANSFER_SENT, {
        userId: sender._id, req,
        target: { type: 'Transaction', id: String(result.senderTx._id) },
        metadata: { amount, recipientId: String(recipient._id) }
    });

    res.status(200).json({
        message: 'Transfer successful',
        senderTransactionId: result.senderTx._id,
        recipientTransactionId: result.recipientTx._id,
        balance: result.sender.accountBalance
    });
});

/**
 * Wallet summary computed in the database.
 *
 * The previous version loaded every transaction the user had ever made into
 * Node memory and summed them in a forEach — megabytes of BSON per dashboard
 * load once a user has a few thousand rows.
 */
export const getTransactionSummary = asyncHandler(async (req, res) => {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    const rows = await Transaction.aggregate([
        { $match: { userId } },
        {
            $group: {
                _id: {
                    type: '$type',
                    isTopUp: { $in: ['$category', ['Top Up', 'Stripe']] }
                },
                total: { $sum: '$amount' },
                count: { $sum: 1 }
            }
        }
    ]);

    let sent = 0;
    let received = 0;
    let added = 0;
    let count = 0;

    for (const row of rows) {
        count += row.count;
        if (row._id.type === 'Debit') sent += row.total;
        else if (row._id.isTopUp) added += row.total;
        else received += row.total;
    }

    res.status(200).json({
        sent: Number(sent.toFixed(2)),
        received: Number(received.toFixed(2)),
        added: Number(added.toFixed(2)),
        count
    });
});

/**
 * Recent activity for the dashboard.
 *
 * This route previously returned the user's *entire* transaction history with
 * no limit, and the client stored all of it in context on every page load.
 */
export const getTransactions = asyncHandler(async (req, res) => {
    const limit = asInt(req.query.limit, { min: 1, max: 50, fallback: 10 });

    const transactions = await Transaction.find({ userId: req.user.id })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

    res.status(200).json({ transactions });
});

/**
 * Escape a value for CSV.
 *
 * Two distinct concerns:
 *
 *  1. RFC-4180 quoting, so a description containing a comma, quote or newline
 *     doesn't shift every following column.
 *
 *  2. CSV injection (a.k.a. formula injection). A description of
 *     `=HYPERLINK("http://evil","click")` — or `=cmd|'/c calc'!A1` — is
 *     interpreted as a *formula* when the exported file is opened in Excel,
 *     Google Sheets or LibreOffice. Since transaction descriptions are attacker
 *     controlled and users forward statements to accountants, a leading
 *     =, +, -, @, tab or CR is prefixed with an apostrophe to force text.
 */
const csvCell = (value) => {
    let s = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
    return s;
};

/**
 * Stream the user's transactions as CSV.
 *
 * Uses a cursor rather than materialising the full result set: an account with
 * tens of thousands of rows would otherwise be built into one giant string in
 * memory before the first byte reached the client.
 */
export const exportTransactionsCsv = asyncHandler(async (req, res) => {
    const query = { userId: new mongoose.Types.ObjectId(req.user.id) };

    const type = asEnum(req.query.type, ['Credit', 'Debit']);
    if (type) query.type = type;

    const start = asString(req.query.startDate) ? new Date(req.query.startDate) : null;
    const end = asString(req.query.endDate) ? new Date(req.query.endDate) : null;
    const validStart = start && !Number.isNaN(start.getTime());
    const validEnd = end && !Number.isNaN(end.getTime());
    if (validStart || validEnd) {
        query.createdAt = {};
        if (validStart) query.createdAt.$gte = start;
        if (validEnd) query.createdAt.$lte = end;
    }

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="paypro-transactions-${stamp}.csv"`);
    // Stop a proxy or browser from caching a statement containing financial data.
    res.setHeader('Cache-Control', 'no-store');

    // BOM so Excel opens UTF-8 (₹, accented names) correctly instead of mojibake.
    res.write('﻿');
    res.write('Date,Invoice ID,Description,Category,Type,Amount (INR),Risk Level\n');

    const cursor = Transaction.find(query)
        .sort({ createdAt: -1 })
        .select('createdAt invoiceId description category type amount riskLevel')
        .lean()
        .cursor();

    try {
        for await (const t of cursor) {
            res.write([
                csvCell(new Date(t.createdAt).toISOString()),
                csvCell(t.invoiceId),
                csvCell(t.description),
                csvCell(t.category),
                csvCell(t.type),
                csvCell(Number(t.amount).toFixed(2)),
                csvCell(t.riskLevel),
            ].join(',') + '\n');
        }
        res.end();
    } catch (err) {
        // Headers are already sent, so the error handler can't produce JSON.
        // Destroy the response so the client sees a truncated download rather
        // than a silently short file it might mistake for complete.
        console.error('CSV export failed mid-stream:', err);
        res.destroy(err);
    }
});
