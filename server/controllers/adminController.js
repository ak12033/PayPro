import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Payment from '../models/Payment.js';
import { runReconciliation, repairAccountBalance } from '../services/reconciliationService.js';
import { listWebhookEvents } from '../services/webhookService.js';
import { listCases, getCase, reviewCase, escalateCase, listUserCases, RiskCaseError } from '../services/riskCaseService.js';
import { adminReset, TotpError } from '../services/totpService.js';
import { sendEmailAlert } from '../services/emailService.js';
import { asObjectId, asString, asInt, asEnum, escapeRegex } from '../utils/sanitize.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { audit } from '../services/auditService.js';
import AuditLog, { AUDIT } from '../models/AuditLog.js';
import { verifyMinorColumns } from '../services/minorBackfillService.js';
import { startOfDayIST } from '../utils/period.js';
import { SETTLED_STATUSES, TX_STATUSES, TX_SOURCES } from '../constants/transactionStatus.js';
import Session from '../models/Session.js';
import RiskCase from '../models/RiskCase.js';
import SupportTicket from '../models/SupportTicket.js';
import { applyAdjustment } from '../services/ledgerService.js';
import { replayWebhookEvent, resettleOrder, SettlementError } from '../services/paymentSettlementService.js';
import { notifyUser } from '../services/notificationService.js';
import { emitToUser } from '../utils/socket.js';
import { parseAmount, newBalanceFields, fromPaise, AMOUNT_MINOR_EXPR } from '../utils/money.js';
import { requireReauth } from '../utils/requireReauth.js';

/**
 * High-level counters for the admin dashboard's landing view.
 *
 * Deliberately cheap: counts and a same-day volume sum, not a full
 * reconciliation pass (that is its own endpoint, and is not free to run on
 * every dashboard load).
 */
export const getMetrics = asyncHandler(async (req, res) => {
    const [userCount, suspendedCount, todayVolume, paymentStatusCounts, pendingWebhooks] = await Promise.all([
        User.countDocuments({}),
        User.countDocuments({ status: 'suspended' }),
        Transaction.aggregate([
            { $match: { settlement: 'settled', status: { $in: SETTLED_STATUSES }, createdAt: { $gte: startOfDayIST() } } },
            { $group: { _id: '$type', total: { $sum: AMOUNT_MINOR_EXPR } } },
        ]),
        Payment.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
        listWebhookEvents({ status: 'received', limit: 1 }),
    ]);

    const captured = paymentStatusCounts.find((r) => r._id === 'captured')?.count ?? 0;
    const totalPayments = paymentStatusCounts.reduce((sum, r) => sum + r.count, 0);
    const creditsMinor = todayVolume.find((r) => r._id === 'Credit')?.total ?? 0;
    const debitsMinor = todayVolume.find((r) => r._id === 'Debit')?.total ?? 0;

    res.status(200).json({
        users: { total: userCount, suspended: suspendedCount },
        volumeToday: {
            credits: fromPaise(creditsMinor),
            debits: fromPaise(debitsMinor),
            creditsMinor,
            debitsMinor,
        },
        payments: {
            total: totalPayments,
            captured,
            successRate: totalPayments ? Number(((captured / totalPayments) * 100).toFixed(1)) : null,
        },
        pendingWebhooks: pendingWebhooks.total,
    });
});

/** Read-only wallet reconciliation report — see reconciliationService.js. */
export const getReconciliationReport = asyncHandler(async (req, res) => {
    const userId = asObjectId(req.query.userId);
    const report = await runReconciliation(userId ? { userId } : {});
    res.status(200).json(report);
});

/**
 * Give `repairAccountBalance` its first real caller (plan.md §4.14 / §28.2).
 * It was previously reachable only from a CLI script, so a drifted account
 * discovered in production could not be fixed without shell access.
 */
export const repairAccount = asyncHandler(async (req, res) => {
    const userId = asObjectId(req.params.userId);
    if (!userId) return res.status(400).json({ message: 'A valid user id is required' });

    const reason = asString(req.body?.reason, { maxLength: 280 }) || 'Admin reconciliation repair';
    const result = await repairAccountBalance(userId, { reason, actorId: req.user.id });

    audit(AUDIT.ADMIN_RECONCILIATION_REPAIR, {
        userId: req.user.id, req,
        target: { type: 'User', id: String(userId) },
        metadata: result,
    });

    res.status(200).json(result);
});

/** Paginated, searchable user directory for support/admin lookup. */
export const listUsers = asyncHandler(async (req, res) => {
    const page = asInt(req.query.page, { min: 1, max: 100000, fallback: 1 });
    const limit = asInt(req.query.limit, { min: 1, max: 100, fallback: 25 });
    const search = asString(req.query.search, { maxLength: 100 });

    const query = {};
    if (search) {
        query.$or = [{ email: { $regex: escapeRegex(search), $options: 'i' } }];
    }

    audit(AUDIT.ADMIN_PII_ACCESSED, { userId: req.user.id, req, metadata: { search: Boolean(search) } });

    const [users, total] = await Promise.all([
        User.find(query)
            .select('firstName lastName email emailVerified role status kycTier accountBalance balanceMinor createdAt')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        User.countDocuments(query),
    ]);

    res.status(200).json({ users, total, currentPage: page, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

/** Only an existing admin can grant or revoke a role — see scripts/promoteAdmin.js for the first one. */
export const updateUserRole = asyncHandler(async (req, res) => {
    const userId = asObjectId(req.params.userId);
    const role = asEnum(req.body?.role, ['user', 'support', 'risk', 'admin']);
    if (!userId || !role) return res.status(400).json({ message: 'A valid user id and role are required' });

    const actor = await requireReauth(req, res);
    if (!actor) return;

    const target = await User.findByIdAndUpdate(userId, { $set: { role } }, { new: true }).select('email role');
    if (!target) return res.status(404).json({ message: 'User not found' });

    audit(AUDIT.ADMIN_ROLE_CHANGED, {
        userId: req.user.id, req,
        target: { type: 'User', id: String(userId) },
        metadata: { role },
    });

    res.status(200).json({ message: `${target.email} is now ${role}`, user: target });
});

const setAccountStatus = (status, auditAction) => asyncHandler(async (req, res) => {
    const userId = asObjectId(req.params.userId);
    if (!userId) return res.status(400).json({ message: 'A valid user id is required' });

    const actor = await requireReauth(req, res);
    if (!actor) return;

    const target = await User.findByIdAndUpdate(userId, { $set: { status } }, { new: true }).select('email status');
    if (!target) return res.status(404).json({ message: 'User not found' });

    audit(auditAction, {
        userId: req.user.id, req,
        target: { type: 'User', id: String(userId) },
        metadata: { status },
    });

    res.status(200).json({ message: `${target.email} is now ${status}`, user: target });
});

export const suspendUser = setAccountStatus('suspended', AUDIT.ADMIN_USER_SUSPENDED);
export const reactivateUser = setAccountStatus('active', AUDIT.ADMIN_USER_REACTIVATED);

/**
 * The integer-paise go/no-go report (plan.md §7.4 step 2). Read-only: the
 * backfill itself is CLI-only (`npm run backfill:minor -- --apply`), because a
 * bulk migration write should be a deliberate, reviewed operator action, not
 * a button in a web console.
 */
export const getMinorVerification = asyncHandler(async (req, res) => {
    res.status(200).json(await verifyMinorColumns());
});

/**
 * Audit-log search (plan.md §28.2 "Audit logs"). Reading the trail is itself
 * a PII access — IPs, user agents, who did what — so it is logged like one.
 */
export const getAuditLogs = asyncHandler(async (req, res) => {
    const page = asInt(req.query.page, { min: 1, max: 100000, fallback: 1 });
    const limit = asInt(req.query.limit, { min: 1, max: 100, fallback: 50 });
    const userId = req.query.userId ? asObjectId(req.query.userId) : null;
    if (req.query.userId && !userId) return res.status(400).json({ message: 'A valid user id is required' });

    const outcome = asEnum(req.query.outcome, ['success', 'failure']);
    // Prefix match on the dotted namespace ("admin.", "wallet.transfer") —
    // anchored and escaped, so it can use the { action, createdAt } index and
    // cannot be turned into an arbitrary regex.
    const action = asString(req.query.action, { maxLength: 80 });

    // Date range (§28.2 "filter by … date"). A bare day is an IST calendar day
    // (the product's one definition of a day, utils/period.js), and `to` is
    // inclusive: "to 2026-09-22" means through the end of that day.
    const from = asDayBound(req.query.from, 'start');
    const to = asDayBound(req.query.to, 'end');
    if ((req.query.from && !from) || (req.query.to && !to)) {
        return res.status(400).json({ message: 'Dates must be YYYY-MM-DD or ISO 8601' });
    }
    if (from && to && from > to) return res.status(400).json({ message: '"From" must be on or before "to"' });

    const query = {};
    if (userId) query.userId = userId;
    if (outcome) query.outcome = outcome;
    if (action) query.action = { $regex: `^${escapeRegex(action)}` };
    if (from || to) {
        query.createdAt = {};
        if (from) query.createdAt.$gte = from;
        if (to) query.createdAt.$lte = to;
    }

    audit(AUDIT.ADMIN_PII_ACCESSED, {
        userId: req.user.id, req,
        metadata: { resource: 'audit_logs', filteredByUser: Boolean(userId), filteredByDate: Boolean(from || to) },
    });

    const [entries, total] = await Promise.all([
        AuditLog.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('userId', 'firstName lastName email')
            .lean(),
        AuditLog.countDocuments(query),
    ]);

    res.status(200).json({ entries, total, currentPage: page, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

/** Webhook delivery log — filter by status, for spotting a stuck queue. */
export const getWebhookEvents = asyncHandler(async (req, res) => {
    const status = asEnum(req.query.status, ['received', 'processed', 'failed', 'ignored']);
    const page = asInt(req.query.page, { min: 1, max: 100000, fallback: 1 });
    const limit = asInt(req.query.limit, { min: 1, max: 100, fallback: 25 });

    const result = await listWebhookEvents({ status, page, limit });
    res.status(200).json(result);
});

// ---------------------------------------------------------------------------
// Risk queue (plan.md §28.2 / §30.2.3)
// ---------------------------------------------------------------------------

/**
 * The held/blocked transfer queue.
 *
 * Deliberately not behind `requireReauth`: reviewing is the routine work of the
 * role, and asking for a password on every case would make reviewers batch
 * decisions to avoid the friction — which is the opposite of what a review
 * queue is for. Suspending an account, which is destructive and rare, still
 * asks. Every decision is audited with the actor either way.
 */
export const getRiskQueue = asyncHandler(async (req, res) => {
    const status = asEnum(req.query.status, ['open', 'approved', 'rejected', 'auto_released', 'all']) || 'open';
    const page = asInt(req.query.page, { min: 1, max: 100000, fallback: 1 });
    const limit = asInt(req.query.limit, { min: 1, max: 100, fallback: 25 });

    res.status(200).json(await listCases({ status, page, limit }));
});

export const getRiskCase = asyncHandler(async (req, res) => {
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'A valid case id is required' });

    try {
        res.status(200).json({ case: await getCase(id) });
    } catch (err) {
        if (err instanceof RiskCaseError) return res.status(err.status).json({ message: err.message });
        throw err;
    }
});

export const postRiskDecision = asyncHandler(async (req, res) => {
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'A valid case id is required' });

    const decision = asEnum(req.body?.decision, ['approved', 'rejected']);
    if (!decision) return res.status(400).json({ message: 'Decision must be approved or rejected' });

    try {
        const reviewed = await reviewCase({
            caseId: id,
            reviewerId: req.user.id,
            reviewerRole: req.user.role,
            decision,
            notes: asString(req.body?.notes, { maxLength: 1000 }) || '',
            req,
        });
        res.status(200).json({ case: reviewed });
    } catch (err) {
        if (err instanceof RiskCaseError) return res.status(err.status).json({ message: err.message, code: err.code });
        throw err;
    }
});

/**
 * Escalate a case to an admin (§28.2 "approve/reject/escalate").
 *
 * The case stays open, becomes urgent, and from then on only an admin can
 * decide it. A hold's auto-release deadline is pushed out, because an
 * escalation is a reviewer saying "this needs more than me" and the timer must
 * not release it while it waits for that. It is pushed out once and by a fixed
 * amount, so an escalated case still cannot strand money indefinitely.
 */
export const postRiskEscalation = asyncHandler(async (req, res) => {
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'A valid case id is required' });

    const reason = asString(req.body?.reason, { maxLength: 1000 });
    if (!reason || reason.length < 10) {
        return res.status(400).json({ message: 'Say why this needs an admin (at least 10 characters)' });
    }

    try {
        const escalated = await escalateCase({ caseId: id, actorId: req.user.id, actorRole: req.user.role, reason, req });
        res.status(200).json({ case: escalated });
    } catch (err) {
        if (err instanceof RiskCaseError) return res.status(err.status).json({ message: err.message, code: err.code });
        throw err;
    }
});

/**
 * The user's own view of their held transfers. Mounted on the *user* side of
 * the API, not here — it is included in this controller only because it reads
 * the same collection, and it is scoped to `req.user.id` so it can never
 * surface another account's case.
 */
export const getMyRiskCases = asyncHandler(async (req, res) => {
    res.status(200).json({ cases: await listUserCases(req.user.id) });
});

// ---------------------------------------------------------------------------
// Console gaps against plan.md §28.2 (2026-09-14): user detail, force logout,
// cross-user transaction search, payments, webhook replay, manual adjustments.
// ---------------------------------------------------------------------------

/**
 * Like `asDate`, but a bare `YYYY-MM-DD` is the start or the last millisecond
 * of that day in IST rather than UTC midnight, which would drop the first 5½
 * hours of an Indian day from the result.
 */
const asDayBound = (value, edge) => {
    const s = asString(value, { maxLength: 40 });
    if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const d = new Date(`${s}T${edge === 'end' ? '23:59:59.999' : '00:00:00.000'}+05:30`);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    return asDate(value);
};

/** `YYYY-MM-DD` or a full ISO string → Date, or null. Never throws on junk. */
const asDate = (value) => {
    const s = asString(value, { maxLength: 40 });
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
};

const sendSettlementError = (res, err) => {
    if (err instanceof SettlementError) return res.status(err.status).json({ message: err.message, code: err.code });
    throw err;
};

/**
 * One account, for a support or risk conversation (§28.2 "Users — detail").
 * The directory row carries only identity; this is what an agent needs to
 * answer "what has happened on this account" without opening five screens.
 */
export const getUserDetail = asyncHandler(async (req, res) => {
    const userId = asObjectId(req.params.userId);
    if (!userId) return res.status(400).json({ message: 'A valid user id is required' });

    const user = await User.findById(userId)
        .select('firstName lastName email emailVerified emailVerifiedAt role status kycTier accountBalance balanceMinor lastLoginLocation lockUntil createdAt totp.enabled totp.enabledAt')
        .lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    const now = new Date();
    const [activeSessions, recentTransactions, openRiskCases, openTickets, recentPayments] = await Promise.all([
        Session.countDocuments({ userId, isValid: true, expiresAt: { $gt: now } }),
        Transaction.find({ userId })
            .sort({ createdAt: -1 })
            .limit(10)
            .select('description amount type category status settlement source invoiceId createdAt')
            .lean(),
        RiskCase.countDocuments({ userId, status: 'open' }),
        SupportTicket.countDocuments({ userId, status: { $in: ['open', 'awaiting_user', 'in_progress'] } }),
        Payment.find({ userId }).sort({ createdAt: -1 }).limit(5).select('orderId amount status walletCredited createdAt').lean(),
    ]);

    audit(AUDIT.ADMIN_PII_ACCESSED, {
        userId: req.user.id, req,
        target: { type: 'User', id: String(userId) },
        metadata: { resource: 'user_detail' },
    });

    const { lockUntil, totp, ...profile } = user;
    res.status(200).json({
        user: {
            ...profile,
            locked: Boolean(lockUntil && lockUntil > now),
            // Whether an authenticator is on, for the "Reset 2FA" button. Never the secret.
            totpEnabled: Boolean(totp?.enabled),
            totpEnabledAt: totp?.enabledAt ?? null,
        },
        activeSessions,
        openRiskCases,
        openTickets,
        recentTransactions,
        recentPayments,
    });
});

/**
 * Sign another account out everywhere (§28.2 "Users — force logout-all").
 *
 * The same three steps as the user's own "log out everywhere" — delete the
 * sessions, bump `tokenVersion` so live access tokens die on their next request,
 * and drop push registrations so a device the holder no longer controls stops
 * receiving "you received ₹5,000". Re-authenticated like suspend: it is how
 * staff cut off a compromised account, and it is disruptive when misused.
 */
export const forceLogoutUser = asyncHandler(async (req, res) => {
    const userId = asObjectId(req.params.userId);
    if (!userId) return res.status(400).json({ message: 'A valid user id is required' });

    const actor = await requireReauth(req, res);
    if (!actor) return;

    const target = await User.findByIdAndUpdate(
        userId,
        { $inc: { tokenVersion: 1 }, $set: { fcmTokens: [] } },
        { new: true }
    ).select('email');
    if (!target) return res.status(404).json({ message: 'User not found' });

    const { deletedCount } = await Session.deleteMany({ userId });

    audit(AUDIT.ADMIN_FORCE_LOGOUT, {
        userId: req.user.id, req,
        target: { type: 'User', id: String(userId) },
        metadata: { sessionsRevoked: deletedCount },
    });

    res.status(200).json({ message: `${target.email} has been signed out everywhere`, sessionsRevoked: deletedCount });
});

/**
 * Reset 2FA (§28.2 "Users — reset 2FA"), the last step of the authenticator
 * recovery policy: the holder has lost the app *and* their recovery codes.
 *
 * Admin only, re-authenticated, a written reason of at least 10 characters
 * (what identity check was done belongs in it), and never on the caller's own
 * account — an admin who could reset their own factor would make it optional.
 * The account is signed out everywhere and falls back to emailed codes, and
 * the holder is told by email and in-app, so a reset they did not ask for is
 * noticed.
 */
export const resetUserTwoFactor = asyncHandler(async (req, res) => {
    const userId = asObjectId(req.params.userId);
    if (!userId) return res.status(400).json({ message: 'A valid user id is required' });
    if (String(userId) === String(req.user.id)) {
        return res.status(403).json({ message: 'Another admin has to reset your own authenticator', code: 'SELF_RESET' });
    }

    const reason = asString(req.body?.reason, { maxLength: 500 });
    if (!reason || reason.length < 10) {
        return res.status(400).json({ message: 'Record how the holder was verified (at least 10 characters)' });
    }

    const actor = await requireReauth(req, res);
    if (!actor) return;

    let result;
    try {
        result = await adminReset(userId);
    } catch (err) {
        if (err instanceof TotpError) return res.status(err.status).json({ message: err.message, code: err.code });
        throw err;
    }

    audit(AUDIT.ADMIN_2FA_RESET, {
        userId: req.user.id, req,
        target: { type: 'User', id: String(userId) },
        metadata: { reason, sessionsRevoked: result.sessionsRevoked, targetRole: result.user.role },
    });

    const body = 'The authenticator app on your PayPro account was removed by our support team at your request, and you have been signed out everywhere. Codes will be emailed to you until you set up a new one. If you did not ask for this, contact support immediately.';
    notifyUser(userId, 'Security', 'Authenticator app removed', body, {}).catch(() => {});
    sendEmailAlert(result.user, 'securityChange', { title: 'Authenticator app removed', body });

    res.status(200).json({
        message: `${result.user.email}'s authenticator was removed and they were signed out everywhere`,
        sessionsRevoked: result.sessionsRevoked,
    });
});

/**
 * Transaction search across every account (§28.2 "Transactions").
 *
 * Exact-match on the reference fields people actually read out (`invoiceId`,
 * `paymentRef`), structured filters for the rest — no free-text regex over
 * descriptions, which would be both a collection scan and a way to trawl every
 * customer's notes. Reading other customers' ledgers is logged as a PII access.
 */
export const searchTransactions = asyncHandler(async (req, res) => {
    const page = asInt(req.query.page, { min: 1, max: 100000, fallback: 1 });
    const limit = asInt(req.query.limit, { min: 1, max: 100, fallback: 25 });

    if (req.query.userId && !asObjectId(req.query.userId)) {
        return res.status(400).json({ message: 'A valid user id is required' });
    }

    const query = {};
    const userId = asObjectId(req.query.userId);
    if (userId) query.userId = userId;

    const invoiceId = asString(req.query.invoiceId, { maxLength: 60 });
    if (invoiceId) query.invoiceId = invoiceId;
    const paymentRef = asString(req.query.paymentRef, { maxLength: 120 });
    if (paymentRef) query.paymentRef = paymentRef;

    const status = asEnum(req.query.status, TX_STATUSES);
    if (status) query.status = status;
    const source = asEnum(req.query.source, TX_SOURCES);
    if (source) query.source = source;
    const type = asEnum(req.query.type, ['Credit', 'Debit']);
    if (type) query.type = type;

    const amountRange = {};
    const min = asString(req.query.minAmount, { maxLength: 20 });
    const max = asString(req.query.maxAmount, { maxLength: 20 });
    if (min && Number.isFinite(Number(min))) amountRange.$gte = Number(min);
    if (max && Number.isFinite(Number(max))) amountRange.$lte = Number(max);
    if (Object.keys(amountRange).length) query.amount = amountRange;

    const dateRange = {};
    const from = asDate(req.query.from);
    const to = asDate(req.query.to);
    if (from) dateRange.$gte = from;
    if (to) dateRange.$lte = to;
    if (Object.keys(dateRange).length) query.createdAt = dateRange;

    audit(AUDIT.ADMIN_PII_ACCESSED, {
        userId: req.user.id, req,
        metadata: { resource: 'transactions', filteredByUser: Boolean(userId) },
    });

    const [transactions, total] = await Promise.all([
        Transaction.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .select('-statusHistory -refund')
            .populate('userId', 'firstName lastName email')
            .lean(),
        Transaction.countDocuments(query),
    ]);

    res.status(200).json({ transactions, total, currentPage: page, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

/** One row with its status history, the other leg of a transfer, and what it links to. */
export const getTransactionDetail = asyncHandler(async (req, res) => {
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'A valid transaction id is required' });

    const transaction = await Transaction.findById(id)
        .select('+adjustment.actorId')
        .populate('userId', 'firstName lastName email')
        .populate('recipientId', 'firstName lastName email')
        .populate('adjustment.actorId', 'firstName lastName email')
        .lean();
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });

    const [otherLeg, payment, riskCases] = await Promise.all([
        transaction.transferGroupId
            ? Transaction.findOne({ transferGroupId: transaction.transferGroupId, _id: { $ne: id } })
                .select('userId type amount status invoiceId')
                .populate('userId', 'firstName lastName email')
                .lean()
            : null,
        transaction.paymentRef
            ? Payment.findOne({ orderId: transaction.paymentRef })
                .select('orderId paymentId amount status walletCredited walletDebitedOnRefund refundId createdAt')
                .lean()
            : null,
        RiskCase.find({ transactionId: id }).select('score action status priority createdAt').lean(),
    ]);

    audit(AUDIT.ADMIN_PII_ACCESSED, {
        userId: req.user.id, req,
        target: { type: 'Transaction', id: String(id) },
        metadata: { resource: 'transaction_detail' },
    });

    res.status(200).json({ transaction, otherLeg, payment, riskCases });
});

/**
 * Gateway payments across accounts (§28.2 "Payments"). `stuck=true` narrows to
 * the rows an operator should look at: captured but never credited, or created
 * more than 30 minutes ago and still waiting on the gateway.
 */
export const listPayments = asyncHandler(async (req, res) => {
    const page = asInt(req.query.page, { min: 1, max: 100000, fallback: 1 });
    const limit = asInt(req.query.limit, { min: 1, max: 100, fallback: 25 });

    const query = {};
    const status = asEnum(req.query.status, ['created', 'captured', 'failed', 'refunded']);
    if (status) query.status = status;
    const orderId = asString(req.query.orderId, { maxLength: 120 });
    if (orderId) query.orderId = orderId;
    if (req.query.userId) {
        const userId = asObjectId(req.query.userId);
        if (!userId) return res.status(400).json({ message: 'A valid user id is required' });
        query.userId = userId;
    }
    if (req.query.stuck === 'true') {
        query.$or = [
            { status: 'captured', walletCredited: { $ne: true } },
            { status: 'created', createdAt: { $lt: new Date(Date.now() - 30 * 60 * 1000) } },
        ];
    }

    const [payments, total] = await Promise.all([
        Payment.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('userId', 'firstName lastName email')
            .lean(),
        Payment.countDocuments(query),
    ]);

    res.status(200).json({ payments, total, currentPage: page, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

/** Ask the gateway what happened to an uncredited order, and credit it if it captured. */
export const resettlePayment = asyncHandler(async (req, res) => {
    const orderId = asString(req.params.orderId, { maxLength: 120 });
    if (!orderId) return res.status(400).json({ message: 'An order id is required' });

    try {
        const result = await resettleOrder(orderId);
        audit(AUDIT.ADMIN_PAYMENT_RESETTLED, {
            userId: req.user.id, req,
            target: { type: 'Payment', id: orderId },
            metadata: result,
        });
        res.status(200).json({
            ...result,
            message: result.alreadySettled
                ? 'This order had already credited the wallet.'
                : 'Captured payment found and the wallet credited.',
        });
    } catch (err) {
        if (err instanceof SettlementError) {
            audit(AUDIT.ADMIN_PAYMENT_RESETTLED, {
                userId: req.user.id, req, outcome: 'failure',
                target: { type: 'Payment', id: orderId },
                metadata: { code: err.code },
            });
        }
        return sendSettlementError(res, err);
    }
});

/** Re-run a stored webhook that never finished — see paymentSettlementService.replayWebhookEvent. */
export const replayWebhook = asyncHandler(async (req, res) => {
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'A valid event id is required' });

    try {
        const result = await replayWebhookEvent(id);
        audit(AUDIT.ADMIN_WEBHOOK_REPLAYED, {
            userId: req.user.id, req,
            outcome: result.outcome === 'failed' ? 'failure' : 'success',
            target: { type: 'WebhookEvent', id: String(id) },
            metadata: result,
        });
        res.status(200).json(result);
    } catch (err) {
        return sendSettlementError(res, err);
    }
});

/**
 * A manual credit or debit (§28.2 "Manual adjustments").
 *
 * Every rule §28.3 sets for this is enforced here or below it: admin only
 * (route), re-authenticated (rule 4), a mandatory written reason (§29.3 rule 3),
 * an audit entry with actor, target and before/after (rule 1), and the money
 * moves through `ledgerService.applyAdjustment` as a visible ledger row, never a
 * direct balance write (rule 2). Staff cannot adjust their own account.
 */
export const createAdjustment = asyncHandler(async (req, res) => {
    const userId = asObjectId(req.body?.userId);
    if (!userId) return res.status(400).json({ message: 'A valid user id is required' });
    if (String(userId) === String(req.user.id)) {
        return res.status(403).json({ message: 'You cannot adjust your own balance' });
    }

    const type = asEnum(req.body?.type, ['Credit', 'Debit']);
    if (!type) return res.status(400).json({ message: 'Type must be Credit or Debit' });

    const parsed = parseAmount(req.body?.amount);
    if (!parsed.ok) return res.status(400).json({ message: parsed.error });

    const reason = asString(req.body?.reason, { maxLength: 280 });
    if (!reason || reason.length < 10) {
        return res.status(400).json({ message: 'A reason of at least 10 characters is required' });
    }

    const actor = await requireReauth(req, res);
    if (!actor) return;

    const { user, transaction } = await applyAdjustment({
        userId, amount: parsed.value, type, reason, actorId: req.user.id,
    });

    audit(AUDIT.ADMIN_BALANCE_ADJUSTED, {
        userId: req.user.id, req,
        target: { type: 'User', id: String(userId) },
        metadata: {
            type,
            amount: parsed.value,
            reason,
            transactionId: String(transaction._id),
            previousBalance: transaction.adjustment.previousBalance,
            correctedBalance: transaction.adjustment.correctedBalance,
        },
    });

    // The customer's copy leaves out who made the change — the same rule the
    // schema's `select: false` on `adjustment.actorId` applies to their reads.
    const customerCopy = transaction.toObject();
    delete customerCopy.adjustment.actorId;
    emitToUser(String(userId), 'wallet_update', { ...newBalanceFields(user), transaction: customerCopy });
    notifyUser(
        userId, 'Payment',
        type === 'Credit' ? 'Your balance was adjusted' : 'A correction was applied to your balance',
        `${type === 'Credit' ? 'A credit' : 'A debit'} of ₹${parsed.value} was applied by PayPro support. It appears in your activity with the reference ${transaction.invoiceId}.`,
        { transactionId: String(transaction._id), amount: parsed.value }
    ).catch(() => {});

    res.status(201).json({
        message: `${type} of ₹${parsed.value} applied`,
        transaction,
        ...newBalanceFields(user),
    });
});
