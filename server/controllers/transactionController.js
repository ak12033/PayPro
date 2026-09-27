import mongoose from 'mongoose';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import Otp, { OTP_TTL_MS } from '../models/Otp.js';
import { categorizeTransaction, checkFraud } from '../utils/fastapiClient.js';
import sendOtp from '../utils/sendOtp.js';
import { notifyUser } from '../services/notificationService.js';
import { emitToUser } from '../utils/socket.js';
import {
    transferFunds,
    applyManualTransaction,
    LedgerError
} from '../services/ledgerService.js';
import { checkTransferLimits } from '../services/limitService.js';
import { touchPayee } from '../services/payeeService.js';
import { assessTransfer, TXN_RISK_ACTION } from '../services/transactionRiskService.js';
import { monitorAfterMovement } from '../services/amlService.js';
import { buildDeviceContext, computeFingerprints } from '../services/deviceFingerprintService.js';
import { findDevice } from '../services/trustedDeviceService.js';
import { evaluateAfterTransaction, recomputePeriod } from '../services/budgetService.js';
import { sendEmailAlert } from '../services/emailService.js';
import { streamCsv, streamPdf } from '../services/statementService.js';
import { parseAmount, toPaise, fromPaise, newBalanceFields, balanceOf, balanceMinorOf, AMOUNT_MINOR_EXPR } from '../utils/money.js';
import { asString, asObjectId, asInt, asEnum, escapeRegex } from '../utils/sanitize.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { audit } from '../services/auditService.js';
import { AUDIT } from '../models/AuditLog.js';
import { startOfDayIST } from '../utils/period.js';
import { CATEGORIES, CATEGORY_NAMES } from '../constants/categories.js';
import { iconFor, canRecategorise, findMatchingRule, saveRule, listRules, deleteRule } from '../services/categoryService.js';
import { SETTLED_STATUSES, TX_STATUSES } from '../constants/transactionStatus.js';
import securityConfig from '../config/security.js';
import logger from '../utils/logger.js';

const TRANSFER_2FA_THRESHOLD = 5; // transfers to the same recipient per day
const OTP_BCRYPT_ROUNDS = 10;

/**
 * Categories a user may pick by hand — on the Add Transaction form and as a
 * correction to an AI-assigned category. This is the same canonical list the
 * AI categoriser is constrained to (`server/constants/categories.js`); there
 * used to be three different lists (12 here, 19 in the AI prompt, 6 on the
 * client) that could each name the same real-world category differently.
 */
export const MANUAL_CATEGORIES = CATEGORY_NAMES;

/** How many transfers this sender has made to this recipient since midnight, IST. */
const dailyTransferCount = async (senderId, recipientId) => {
    return Transaction.countDocuments({
        userId: senderId,
        recipientId,
        type: 'Debit',
        category: 'Transfer',
        createdAt: { $gte: startOfDayIST() }
    });
};

/** The canonical category list, for the client's picker and correction UI. */
export const getCategories = asyncHandler(async (req, res) => {
    res.status(200).json({ categories: CATEGORIES });
});

/**
 * Let a user correct a transaction's category.
 *
 * Previously there was no way to do this at all: an AI miscategorisation was
 * permanent. System categories (Transfer, Top Up, Refund) are refused —
 * relabelling a P2P transfer as "Food" would corrupt both the transfer-leg
 * invariant and category-based analytics.
 */
export const updateTransactionCategory = asyncHandler(async (req, res) => {
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'A valid transaction id is required' });

    const category = asEnum(req.body?.category, CATEGORY_NAMES);
    if (!category) return res.status(400).json({ message: 'Not a recognised category' });

    const transaction = await Transaction.findOne({ _id: id, userId: req.user.id });
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });

    if (!canRecategorise(transaction.category)) {
        return res.status(400).json({ message: `A "${transaction.category}" transaction cannot be recategorised.` });
    }

    const previousCategory = transaction.category;
    transaction.category = category;
    transaction.icon = iconFor(category);
    transaction.categorySource = 'user';
    await transaction.save();

    audit(AUDIT.TRANSACTION_RECATEGORISED, {
        userId: req.user.id, req,
        target: { type: 'Transaction', id: String(transaction._id) },
        metadata: { from: previousCategory, to: category }
    });

    /**
     * A budget's spend for both the old and the new category must reflect
     * the move immediately (plan.md §12.4/§13.8) — spend is always computed
     * fresh from the current `category` field, so re-evaluating thresholds
     * for the transaction's current state is all that's needed; nothing
     * needs to be "moved" in a stored total that doesn't exist.
     */
    recomputePeriod(req.user.id, transaction).catch((err) =>
        logger.error('Post-recategorisation budget evaluation error', { error: err.message })
    );

    /**
     * "Always categorise <merchant> as <category>" (plan.md §12.4).
     *
     * Opt-in per correction, never implied by the correction itself — a user
     * fixing one transaction has not necessarily made a standing decision, and
     * silently creating a rule would surprise them the next time the same
     * merchant was filed somewhere they didn't expect. The client asks first.
     */
    let rule = null;
    if (req.body?.alwaysCategorise === true) {
        rule = await saveRule(req.user.id, { description: transaction.description, category, req });
    }

    res.status(200).json({
        message: 'Category updated',
        transaction,
        ...(rule && { rule: { _id: rule._id, merchantKey: rule.merchantKey, category: rule.category } }),
    });
});

/** The user's standing categorisation rules (plan.md §12.4). */
export const getCategoryRules = asyncHandler(async (req, res) => {
    res.status(200).json({ rules: await listRules(req.user.id) });
});

export const deleteCategoryRule = asyncHandler(async (req, res) => {
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'A valid rule id is required' });

    const rule = await deleteRule(req.user.id, id, { req });
    if (!rule) return res.status(404).json({ message: 'Rule not found' });

    res.status(200).json({ message: 'Rule removed' });
});

export const getTransactionById = asyncHandler(async (req, res) => {
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'A valid transaction id is required' });

    const transaction = await Transaction.findOne({ _id: id, userId: req.user.id }).lean();
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });

    res.status(200).json({ transaction });
});

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
    // With an authenticator set up, the code comes from the app and nothing is
    // emailed. The record still pins recipient and amount (plan.md §31.2.4).
    const method = sender.totp?.enabled ? 'totp' : 'email';

    /**
     * crypto.randomInt, not Math.random.
     *
     * Math.random is a non-cryptographic PRNG whose internal state can be
     * recovered from a handful of outputs. The login-OTP path already used
     * crypto.randomInt for exactly this reason (see twoFactorService.js); this
     * transfer challenge — the one guarding money movement — had been missed.
     */
    const otp = method === 'email' ? String(crypto.randomInt(100000, 1000000)) : null;
    const otpHash = otp ? await bcrypt.hash(otp, OTP_BCRYPT_ROUNDS) : undefined;

    // Only one live transfer challenge per user at a time.
    await Otp.deleteMany({ email: sender.email, purpose: 'transfer' });

    const record = await Otp.create({
        email: sender.email,
        otpHash,
        purpose: 'transfer',
        context: { recipientId: String(recipientId), amount, method, userId: String(sender._id) },
        expiry: new Date(Date.now() + OTP_TTL_MS)
    });

    // Email delivery must not block or fail the API response.
    if (otp) {
        sendOtp(sender.email, otp, 'transfer').catch((err) =>
            logger.error('Transfer OTP delivery failed', { error: err.message })
        );
    }

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

    /**
     * No balance check here, on purpose.
     *
     * A manual entry is a note describing spending that happened outside
     * PayPro — it never touches `accountBalance` (see
     * `ledgerService.applyManualTransaction`) — so "would this overdraw the
     * wallet" is not a meaningful question to ask about it. It used to be, back
     * when this endpoint actually moved money, which was itself the defect:
     * `POST /transactions/add` with `{type: "income", amount: 999999}` minted
     * spendable balance for money that never moved.
     */

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

    /**
     * Resolution order, per plan.md §12.3: explicit user choice, then a
     * standing `CategoryRule`, then AI, then the default.
     *
     * The rule lookup sits *above* the AI call rather than correcting it after
     * the fact — a matched rule means no model round trip at all, which is both
     * faster and one less chance for an off-list answer to need validating.
     */
    const matchedRule = chosenCategory ? null : await findMatchingRule(req.user.id, description);

    const [aiCategoryData, fraudResult] = await Promise.all([
        // These two AI calls are independent. Running them sequentially
        // previously doubled the user-visible latency of every transaction.
        chosenCategory
            ? Promise.resolve({ category: chosenCategory, icon: iconFor(chosenCategory) })
            : matchedRule
                ? Promise.resolve(matchedRule)
                : categorizeTransaction(description, amount),
        checkFraud({ description, amount, type, category: chosenCategory }, history)
    ]);

    const categorySource = chosenCategory ? 'user' : matchedRule ? 'rule' : 'ai';

    let result;
    try {
        result = await applyManualTransaction({
            userId: req.user.id,
            description,
            amount,
            type,
            category: aiCategoryData.category,
            icon: aiCategoryData.icon,
            categorySource,
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
        ...newBalanceFields(user),
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
        balance: balanceOf(user), balanceMinor: balanceMinorOf(user)
    });
});

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
 * place rather than being re-derived by each client. Shared with the CSV
 * export below so a filtered export can't silently diverge from what the
 * screen it was exported from actually shows.
 */
const HISTORY_FILTER_PRESETS = {
    Transfer: { type: 'Debit', category: 'Transfer' },
    Received: { type: 'Credit', category: 'Transfer' },
    TopUp: { type: 'Credit', category: { $in: ['Top Up', 'Stripe'] } },
    Payment: { type: 'Debit', category: { $nin: ['Transfer', 'Refund'] } },
    Refund: { category: 'Refund' },
};

/**
 * Every filter below is allow-listed or coerced to a primitive. Passing
 * req.query values straight into a Mongoose filter let a caller send
 * `?type[$ne]=Debit` and rewrite the query's meaning.
 */
const buildHistoryFilter = (userId, query) => {
    const filter = { userId: new mongoose.Types.ObjectId(userId) };

    const search = asString(query.search, { maxLength: 100 });
    if (search) {
        // Escaped: an unescaped user regex is both a ReDoS vector and a way to
        // widen the filter (e.g. `.*`).
        filter.description = { $regex: escapeRegex(search), $options: 'i' };
    }

    const type = asEnum(query.type, ['Credit', 'Debit']);
    if (type) filter.type = type;

    const category = asString(query.category, { maxLength: 60 });
    if (category) filter.category = category;

    const status = asEnum(query.status, TX_STATUSES);
    if (status) filter.status = status;

    const preset = asEnum(query.filter, Object.keys(HISTORY_FILTER_PRESETS));
    if (preset) {
        // Explicit `type`/`category` params win over the preset.
        for (const [key, value] of Object.entries(HISTORY_FILTER_PRESETS[preset])) {
            if (filter[key] === undefined) filter[key] = value;
        }
    }

    const start = asString(query.startDate) ? new Date(query.startDate) : null;
    const end = asString(query.endDate) ? new Date(query.endDate) : null;
    const validStart = start && !Number.isNaN(start.getTime());
    const validEnd = end && !Number.isNaN(end.getTime());
    if (validStart || validEnd) {
        filter.createdAt = {};
        if (validStart) filter.createdAt.$gte = start;
        if (validEnd) filter.createdAt.$lte = end;
    }

    return filter;
};

export const getPaginatedTransactions = asyncHandler(async (req, res) => {
    const page = asInt(req.query.page, { min: 1, max: 100000, fallback: 1 });
    const limit = asInt(req.query.limit, { min: 1, max: 100, fallback: 10 });

    const query = buildHistoryFilter(req.user.id, req.query);

    const minAmount = req.query.minAmount !== undefined ? Number(req.query.minAmount) : NaN;
    const maxAmount = req.query.maxAmount !== undefined ? Number(req.query.maxAmount) : NaN;
    if (Number.isFinite(minAmount) || Number.isFinite(maxAmount)) {
        query.amount = {};
        if (Number.isFinite(minAmount)) query.amount.$gte = minAmount;
        if (Number.isFinite(maxAmount)) query.amount.$lte = maxAmount;
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

/**
 * Shared execution path for both the direct and the OTP-verified transfer.
 * Returns `{ error, status }` for expected business failures.
 */
export const executeTransfer = async ({ sender, recipient, amount, idempotencyKey, risk }) => {
    /**
     * `risk` is supplied by `gateTransfer` on both live transfer paths, so the
     * model is asked once per attempt rather than once per code path. The
     * fallback below keeps this function usable on its own (and keeps every
     * pre-existing caller working) — it is the original behaviour, unchanged.
     */
    let fraudResult = risk;
    if (!fraudResult) {
        const history = await Transaction.find({ userId: sender._id })
            .sort({ createdAt: -1 })
            .limit(10)
            .select('description amount type category createdAt -_id')
            .lean();

        fraudResult = await checkFraud({
            description: `P2P transfer to ${recipient.firstName}`,
            amount,
            type: 'Debit',
            category: 'Transfer'
        }, history);
    }

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
        // Denormalised onto the row for observability only — de-duplication
        // itself now happens *before* settlement, in the idempotency
        // middleware (see middlewares/idempotency.js). A duplicate-key
        // rejection here would be benign either way: the transfer already
        // settled.
        await Transaction.updateOne({ _id: senderTx._id }, { $set: { idempotencyKey } })
            .catch(() => {});
    }

    emitToUser(outcome.sender._id.toString(), 'wallet_update', {
        ...newBalanceFields(outcome.sender),
        transaction: senderTx
    });
    emitToUser(outcome.recipient._id.toString(), 'wallet_update', {
        ...newBalanceFields(outcome.recipient),
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
            : Promise.resolve(),
        // Only the Debit leg is spend for budget purposes — the recipient's
        // Credit leg never touches a budget.
        evaluateAfterTransaction(outcome.sender._id, senderTx),
        // Keeps the saved-payee picker ordered by real use (plan.md §10.2.7).
        // A no-op when this recipient isn't saved.
        touchPayee(outcome.sender._id, recipient._id),
        sendEmailAlert(sender, 'transferSent', { amount, counterpartyName: recipient.firstName }),
        sendEmailAlert(recipient, 'transferReceived', { amount, counterpartyName: sender.firstName }),
        fraudResult.risk_level === 'high'
            ? sendEmailAlert(sender, 'highRiskTransaction', { amount })
            : Promise.resolve(),
        // Shadow-mode AML (plan.md §30.3): both ends — fan-out on the sender,
        // fan-in on the recipient. Flags for review; never blocks.
        monitorAfterMovement([outcome.sender._id, outcome.recipient._id], { trigger: 'transfer' }),
    ]).catch((err) => logger.error('Post-transfer notification error', { error: err.message }));

    return outcome;
};

/**
 * Best-effort resolution of the device this request came from.
 *
 * Only one risk rule needs it (NEW_DEVICE_MONEY_MOVEMENT), and a transfer must
 * never fail because fingerprinting did — so every failure here returns null
 * and that rule simply does not fire.
 */
const resolveRequestDeviceId = async (userId, req) => {
    try {
        const context = buildDeviceContext(req, req.body?.device || {});
        const prints = computeFingerprints(userId, context);
        const { device } = await findDevice(userId, prints);
        return device?._id ?? null;
    } catch {
        return null;
    }
};

/**
 * The transaction risk gate (plan.md §30.2.2).
 *
 * Runs the deterministic rules plus the model, then acts on the result — which
 * is the whole point: before this, `checkFraud`'s verdict was written to the
 * row and ignored. Shared by both transfer entry points so a challenged
 * transfer is assessed on the same terms as a direct one.
 *
 * `twoFactorSatisfied` marks the post-OTP path. A verified challenge answers
 * "is this the account holder?", so a step-up is already satisfied — but it
 * says nothing about whether the destination is a mule account, so a hold or a
 * block still applies.
 *
 * @returns {Promise<{outcome:'allow'|'step_up'|'hold'|'block', risk:object, riskCase?:object}>}
 */
export const gateTransfer = async ({ sender, recipient, amount, req, twoFactorSatisfied = false }) => {
    const history = await Transaction.find({ userId: sender._id })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('description amount type category createdAt -_id')
        .lean();

    /**
     * The model runs first so its score can be fed in as one weighted signal.
     * `checkFraud` already fails open with a low-risk default; `assessTransfer`
     * records that it was unavailable so a degraded control is visible rather
     * than silent (§30.2.4).
     */
    const model = await checkFraud({
        description: `P2P transfer to ${recipient.firstName}`,
        amount,
        type: 'Debit',
        category: 'Transfer'
    }, history);

    const deviceId = await resolveRequestDeviceId(sender._id, req);

    const evaluation = await assessTransfer({ sender, recipient, amount, deviceId, model });

    /** The shape `transferFunds`/`Transaction` expect, now derived from the rules rather than the model alone. */
    const risk = {
        risk_score: evaluation.score,
        risk_level: evaluation.level,
        reason: evaluation.rules.map((r) => r.detail).join('; ') || 'No risk signals',
    };

    if (evaluation.action === TXN_RISK_ACTION.BLOCK) {
        audit(AUDIT.TRANSFER_BLOCKED, {
            userId: sender._id, outcome: 'failure', req,
            target: { type: 'RiskCase', id: String(evaluation.riskCase._id) },
            metadata: { amount, score: evaluation.score, rules: evaluation.rules.map((r) => r.code) },
        });

        Promise.all([
            notifyUser(
                sender._id, 'Security', 'Transfer blocked',
                `We stopped a ₹${amount} transfer to ${recipient.firstName} because it looked unusual. If this was you, contact support to release it.`,
                { riskCaseId: String(evaluation.riskCase._id), amount }
            ),
            sendEmailAlert(sender, 'highRiskTransaction', { amount }),
        ]).catch((err) => logger.error('Risk block notification error', { error: err.message }));

        return { outcome: 'block', risk, riskCase: evaluation.riskCase };
    }

    if (evaluation.action === TXN_RISK_ACTION.HOLD) {
        audit(AUDIT.TRANSFER_HELD, {
            userId: sender._id, req,
            target: { type: 'RiskCase', id: String(evaluation.riskCase._id) },
            metadata: { amount, score: evaluation.score, rules: evaluation.rules.map((r) => r.code) },
        });

        notifyUser(
            sender._id, 'Security', 'Transfer held for review',
            `Your ₹${amount} transfer to ${recipient.firstName} is being reviewed. No money has moved. We'll release it automatically within ${securityConfig.transactionRisk.autoReleaseHours} hours if nothing is wrong.`,
            { riskCaseId: String(evaluation.riskCase._id), amount }
        ).catch((err) => logger.error('Risk hold notification error', { error: err.message }));

        return { outcome: 'hold', risk, riskCase: evaluation.riskCase };
    }

    if (evaluation.action === TXN_RISK_ACTION.STEP_UP && !twoFactorSatisfied) {
        return { outcome: 'step_up', risk };
    }

    return { outcome: 'allow', risk };
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
        User.findById(req.user.id).select('firstName email accountBalance balanceMinor preferences kycTier totp.enabled'),
        User.findById(recipientId).select('firstName email preferences')
    ]);

    if (!sender) return res.status(404).json({ message: 'User not found' });
    if (!recipient) return res.status(404).json({ message: 'Recipient not found' });

    if (balanceMinorOf(sender) < toPaise(amount)) {
        return res.status(400).json({ message: 'Insufficient balance' });
    }

    try {
        await checkTransferLimits({ userId: sender._id, tier: sender.kycTier, amount });
    } catch (err) {
        if (err instanceof LedgerError) {
            audit(AUDIT.LIMIT_EXCEEDED, {
                userId: sender._id, outcome: 'failure', req,
                metadata: { amount, code: err.code },
            });
            return res.status(err.status).json({ message: err.message });
        }
        throw err;
    }

    /**
     * Duplicate-request protection.
     *
     * `idempotency('transfer')` (mounted on this route) already claims the key
     * and replays the original response for a genuine retry, so by the time
     * this handler runs the request is known-fresh. There is nothing left to
     * check here.
     */

    /**
     * 2FA gate.
     *
     * The previous implementation read `skip2FA` straight out of the request
     * body, so any client bypassed the entire challenge by posting
     * `{"skip2FA": true}` on the first request. The decision is now made
     * exclusively server-side, and the only route that can complete a
     * challenged transfer is `verifyTransferOtp`.
     */
    /**
     * Velocity is now one of two reasons to challenge. It is kept as a separate,
     * unconditional rule rather than folded into the risk score because it is
     * *policy* — "the sixth transfer to the same person today always asks" —
     * and policy must not be negotiable by arithmetic. The same two-mechanism
     * split the login risk engine uses, for the same reason.
     */
    const velocity2FA =
        sender.preferences?.transaction2FA !== false &&
        (await dailyTransferCount(sender._id, recipientId)) >= TRANSFER_2FA_THRESHOLD;

    const gate = await gateTransfer({ sender, recipient, amount, req });

    if (gate.outcome === 'block') {
        return res.status(403).json({
            message: 'This transfer was blocked because it looked unusual. Contact support if this was you.',
            code: 'TRANSFER_BLOCKED',
            riskCaseId: String(gate.riskCase._id),
        });
    }

    if (gate.outcome === 'hold') {
        // 202: accepted, not settled. No money has moved and none will until a
        // reviewer approves or the auto-release deadline passes.
        return res.status(202).json({
            message: 'This transfer is being reviewed. No money has moved yet.',
            code: 'TRANSFER_HELD',
            riskCaseId: String(gate.riskCase._id),
        });
    }

    if (velocity2FA || gate.outcome === 'step_up') {
        const challenge = await issueTransferChallenge(sender, recipientId, amount);
        const method = challenge.context.method;
        audit(AUDIT.TRANSFER_2FA_REQUIRED, {
            userId: sender._id, req, target: { type: 'User', id: String(recipientId) },
            metadata: { amount, trigger: velocity2FA ? 'velocity' : 'risk_score', score: gate.risk.risk_score }
        });
        return res.status(403).json({
            message: method === 'totp'
                ? '2FA Required: Enter the code from your authenticator app'
                : `2FA Required: An OTP has been sent to ${sender.email}`,
            require2FA: true,
            method,
            email: sender.email,
        });
    }

    const result = await executeTransfer({ sender, recipient, amount, idempotencyKey, risk: gate.risk });
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
        balance: balanceOf(result.sender), balanceMinor: balanceMinorOf(result.sender)
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
        // Only rows that actually moved money count toward this summary: a
        // manual note (settlement: 'none') describes spending that happened
        // outside PayPro, and a PENDING/FAILED row hasn't (or never will)
        // settle. Without this filter a pending top-up or a manual entry
        // would inflate "money added"/"money sent" for money that was never
        // actually in the wallet.
        { $match: { userId, settlement: 'settled', status: { $in: SETTLED_STATUSES } } },
        {
            $group: {
                _id: {
                    type: '$type',
                    isTopUp: { $in: ['$category', ['Top Up', 'Stripe']] }
                },
                total: { $sum: AMOUNT_MINOR_EXPR },
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

    // Totals are integer paise until here; converted once for the response.
    res.status(200).json({
        sent: fromPaise(sent),
        received: fromPaise(received),
        added: fromPaise(added),
        sentMinor: sent,
        receivedMinor: received,
        addedMinor: added,
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
 * The people this wallet has most recently sent money to.
 *
 * Exists because choosing a recipient was previously always a search: even
 * paying the same person every week meant typing their name from scratch.
 *
 * Recency, not volume, is the ordering. `/analytics/network` already ranks top
 * recipients by total sent, which answers "who do I send the most to" — the
 * wrong question for a shortcut whose whole purpose is "do that again".
 *
 * Grouped in the database rather than by fetching N transactions and
 * de-duplicating in JS: a user who paid one person twenty times in a row would
 * otherwise produce a single shortcut out of a twenty-row fetch.
 */
export const getRecentRecipients = asyncHandler(async (req, res) => {
    const limit = asInt(req.query.limit, { min: 1, max: 10, fallback: 5 });

    const contacts = await Transaction.aggregate([
        {
            $match: {
                userId: new mongoose.Types.ObjectId(req.user.id),
                type: 'Debit',
                category: 'Transfer',
                recipientId: { $ne: null },
            },
        },
        { $sort: { createdAt: -1 } },
        {
            $group: {
                _id: '$recipientId',
                lastSentAt: { $first: '$createdAt' },
                lastAmount: { $first: AMOUNT_MINOR_EXPR },
            },
        },
        { $sort: { lastSentAt: -1 } },
        { $limit: limit },
    ]);

    // A recipient who has since deleted their account must not surface as a
    // tappable shortcut that fails at transfer time, so the join filters them
    // out rather than back-filling an "Unknown" placeholder.
    const users = await User.find({ _id: { $in: contacts.map((c) => c._id) } })
        .select('firstName lastName')
        .lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    const recipients = contacts
        .map((c) => {
            const user = userMap.get(String(c._id));
            if (!user) return null;
            return {
                _id: String(c._id),
                firstName: user.firstName,
                lastName: user.lastName,
                lastSentAt: c.lastSentAt,
                lastAmount: fromPaise(c.lastAmount),
                lastAmountMinor: c.lastAmount,
            };
        })
        .filter(Boolean);

    res.status(200).json({ recipients });
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
export const csvCell = (value) => {
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
    // Same filter builder as the history list, so "export" always means
    // "export what I'm currently looking at" — previously this accepted only
    // `type`/`startDate`/`endDate` and silently dropped the active preset,
    // category and search, so a filtered export downloaded the whole ledger.
    const query = buildHistoryFilter(req.user.id, req.query);

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="paypro-transactions-${stamp}.csv"`);
    // Stop a proxy or browser from caching a statement containing financial data.
    res.setHeader('Cache-Control', 'no-store');

    // BOM so Excel opens UTF-8 (₹, accented names) correctly instead of mojibake.
    res.write('﻿');
    res.write('Date,Invoice ID,Description,Category,Type,Amount (INR),Status,Risk Level\n');

    const cursor = Transaction.find(query)
        .sort({ createdAt: -1 })
        .select('createdAt invoiceId description category type amount status riskLevel')
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
                csvCell(t.status),
                csvCell(t.riskLevel),
            ].join(',') + '\n');
        }
        res.end();
    } catch (err) {
        // Headers are already sent, so the error handler can't produce JSON.
        // Destroy the response so the client sees a truncated download rather
        // than a silently short file it might mistake for complete.
        logger.error('CSV export failed mid-stream', { err });
        res.destroy(err);
    }
});

/**
 * A downloadable monthly statement (plan.md §11.4) — distinct from `/export`
 * above: that endpoint exports whatever filter the Activity screen currently
 * has active; this one is always exactly one calendar month, in a format
 * meant to be handed to someone else (an accountant, a landlord) rather than
 * re-imported into a spreadsheet tool.
 */
export const getStatement = asyncHandler(async (req, res) => {
    const month = asString(req.query.month, { maxLength: 7 });
    const format = asEnum(req.query.format, ['csv', 'pdf'], 'csv');

    if (format === 'pdf') {
        const user = await User.findById(req.user.id).select('firstName lastName email').lean();
        if (!user) return res.status(404).json({ message: 'User not found' });
        return streamPdf(res, user, { month });
    }

    return streamCsv(res, req.user.id, { month });
});
