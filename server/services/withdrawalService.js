import mongoose from 'mongoose';
import User from '../models/User.js';
import BankAccount from '../models/BankAccount.js';
import KycSubmission from '../models/KycSubmission.js';
import Transaction from '../models/Transaction.js';
import WithdrawalRequest, { OPEN_WITHDRAWAL_STATUSES } from '../models/WithdrawalRequest.js';
import { runInTransaction, holdFunds, advanceHold, releaseHold, LedgerError } from './ledgerService.js';
import { checkTransferLimits } from './limitService.js';
import { isVerified } from './kycService.js';
import { storeDocument, listDocuments, countDocuments, readDocument } from './secureDocumentService.js';
import { monitorAfterMovement, checkSharedBankAccount, listUserAlerts, parseCsv, nameKey } from './amlService.js';
import { notifyUser } from './notificationService.js';
import { sendEmailAlert } from './emailService.js';
import { audit } from './auditService.js';
import { AUDIT } from '../models/AuditLog.js';
import { emitToUser } from '../utils/socket.js';
import { encryptField, decryptField, fingerprint, maskTail } from '../utils/fieldEncryption.js';
import { parseAmount, toPaise, fromPaise, newBalanceFields } from '../utils/money.js';
import { DomainError } from '../utils/domainError.js';
import { TX_SOURCE, TX_STATUS } from '../constants/transactionStatus.js';
import { BANK_DOCUMENT_TYPES } from '../constants/kyc.js';
import logger from '../utils/logger.js';

/**
 * Withdrawals to the holder's own bank account (plan.md §0.20.3), executed by
 * an operator's bank transfer — no payout API (the 2026-09-27 decision).
 *
 * What the application owns: the request, the destination and its admin
 * verification, the hold on the ledger, the approval queue, the bank reference
 * (UTR) recorded when the money is sent, a statement match, and the audit
 * trail. What it does not: **moving the money.** That happens outside PayPro, in
 * the bank account that holds customer funds. Which account that may be, and
 * under whose rules, is §41.2 — the go-live gate.
 *
 * The money path:
 *   request  → `holdFunds`: the wallet is debited now, the row is PENDING.
 *   approve  → PROCESSING (an operator is sending it).
 *   paid     → SUCCESS, with the UTR.
 *   reject / cancel / failed → `releaseHold`: the row becomes CANCELLED/FAILED
 *              and the wallet is credited back, once, in the same transaction.
 * Every step is a compare-and-set on the request's status, so a double-click or
 * two admins acting at once can never pay twice or refund twice.
 */

export const MIN_WITHDRAWAL = 100;
export const MAX_BANK_ACCOUNTS = 3;
export const MAX_OPEN_WITHDRAWALS = 3;
const BANK_DOCS = 'bank_account';
const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
/** Operators have this long to finish a transfer before the queue calls it stuck. */
export const STUCK_AFTER_HOURS = 48;

const inr = (amount) => `₹${Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const str = (value, max) => (typeof value === 'string' && value.trim() && value.trim().length <= max ? value.trim() : null);

// ---------------------------------------------------------------------------
// Bank accounts
// ---------------------------------------------------------------------------

const customerAccount = (account, documents = []) => ({
    _id: account._id,
    holderName: account.holderName,
    accountNumberMasked: account.accountNumberMasked,
    ifsc: account.ifsc,
    bankName: account.bankName,
    status: account.status,
    userVisibleReason: account.userVisibleReason,
    reviewedAt: account.reviewedAt,
    createdAt: account.createdAt,
    documents,
});

export const listBankAccounts = async (userId) => {
    const accounts = await BankAccount.find({ userId, status: { $ne: 'removed' } }).sort({ createdAt: -1 }).lean();
    const docs = await Promise.all(accounts.map((a) => listDocuments({ purpose: BANK_DOCS, refId: a._id })));
    return accounts.map((a, i) => customerAccount(a, docs[i]));
};

export const addBankAccount = async (userId, body = {}, { req } = {}) => {
    const holderName = str(body.holderName, 120);
    if (!holderName || holderName.length < 2) throw new DomainError('INVALID_HOLDER', 'Enter the account holder name as the bank has it', 400);

    const accountNumber = typeof body.accountNumber === 'string' ? body.accountNumber.replace(/\s/g, '') : '';
    if (!/^\d{9,18}$/.test(accountNumber)) throw new DomainError('INVALID_ACCOUNT_NUMBER', 'Enter a valid account number (9 to 18 digits)', 400);
    if (typeof body.confirmAccountNumber === 'string' && body.confirmAccountNumber.replace(/\s/g, '') !== accountNumber) {
        throw new DomainError('ACCOUNT_NUMBER_MISMATCH', 'The account numbers do not match', 400);
    }

    const ifsc = typeof body.ifsc === 'string' ? body.ifsc.replace(/\s/g, '').toUpperCase() : '';
    if (!IFSC_PATTERN.test(ifsc)) throw new DomainError('INVALID_IFSC', 'Enter a valid IFSC (for example HDFC0001234)', 400);

    const active = await BankAccount.find({ userId, status: { $ne: 'removed' } }).select('accountNumberFingerprint').lean();
    if (active.length >= MAX_BANK_ACCOUNTS) {
        throw new DomainError('TOO_MANY_ACCOUNTS', `You can keep up to ${MAX_BANK_ACCOUNTS} bank accounts. Remove one first.`, 409);
    }
    const accountNumberFingerprint = fingerprint('bank_account', `${ifsc}:${accountNumber}`);
    if (active.some((a) => a.accountNumberFingerprint === accountNumberFingerprint)) {
        throw new DomainError('DUPLICATE_ACCOUNT', 'You have already added this account', 409);
    }

    const account = await BankAccount.create({
        userId,
        holderName: holderName.replace(/\s+/g, ' '),
        accountNumberMasked: maskTail(accountNumber, 4),
        accountNumberEncrypted: encryptField(accountNumber),
        accountNumberFingerprint,
        ifsc,
        bankName: str(body.bankName, 80) || '',
    });

    audit(AUDIT.BANK_ACCOUNT_ADDED, {
        userId, req,
        target: { type: 'BankAccount', id: String(account._id) },
        metadata: { accountNumberMasked: account.accountNumberMasked, ifsc },
    });

    // A destination for money leaving PayPro is exactly what a takeover adds
    // first, so the holder always hears about it.
    const user = await User.findById(userId).select('email firstName preferences').lean();
    const body_ = `A bank account ending ${accountNumber.slice(-4)} was added to your PayPro account. We will check it before any money can be sent to it. If this was not you, contact support now.`;
    notifyUser(userId, 'Account', 'Bank account added', body_, { bankAccountId: String(account._id) }).catch(() => {});
    if (user) sendEmailAlert(user, 'accountUpdate', { title: 'Bank account added', body: body_ });

    checkSharedBankAccount({ userId, accountNumberFingerprint })
        .catch((err) => logger.error('Shared bank account check failed', { err }));

    return customerAccount(account.toObject());
};

export const addBankDocument = async (userId, accountId, { type, fileName, buffer }, { req } = {}) => {
    if (!BANK_DOCUMENT_TYPES.includes(type)) throw new DomainError('INVALID_TYPE', 'Choose what kind of document this is', 400);
    const account = await BankAccount.findOne({ _id: accountId, userId }).select('status').lean();
    if (!account) throw new DomainError('NOT_FOUND', 'Bank account not found', 404);
    if (account.status !== 'pending') throw new DomainError('NOT_EDITABLE', 'Proof can only be added while the account is being checked', 409);
    if (await countDocuments({ purpose: BANK_DOCS, refId: accountId }) >= 3) {
        throw new DomainError('TOO_MANY_DOCUMENTS', 'You can upload up to 3 documents for an account', 409);
    }
    const document = await storeDocument({ ownerId: userId, purpose: BANK_DOCS, refId: accountId, type, fileName, buffer });
    audit(AUDIT.KYC_DOCUMENT_UPLOADED, {
        userId, req,
        target: { type: 'BankAccount', id: String(accountId) },
        metadata: { documentId: String(document._id), documentType: type, size: document.size },
    });
    return document;
};

export const removeBankAccount = async (userId, accountId, { req } = {}) => {
    if (await WithdrawalRequest.exists({ userId, bankAccountId: accountId, status: { $in: OPEN_WITHDRAWAL_STATUSES } })) {
        throw new DomainError('WITHDRAWAL_OPEN', 'A withdrawal to this account is still in progress', 409);
    }
    const account = await BankAccount.findOneAndUpdate(
        { _id: accountId, userId, status: { $ne: 'removed' } },
        { $set: { status: 'removed', removedAt: new Date() } },
        { new: true }
    );
    if (!account) throw new DomainError('NOT_FOUND', 'Bank account not found', 404);
    audit(AUDIT.BANK_ACCOUNT_REMOVED, {
        userId, req,
        target: { type: 'BankAccount', id: String(accountId) },
        metadata: { accountNumberMasked: account.accountNumberMasked },
    });
};

// ---- review

export const listBankAccountQueue = async ({ status = 'pending', page = 1, limit = 25 } = {}) => {
    const query = status === 'all' ? {} : { status };
    const [accounts, total] = await Promise.all([
        BankAccount.find(query).sort({ createdAt: 1 }).skip((page - 1) * limit).limit(limit)
            .populate('userId', 'firstName lastName email').lean(),
        BankAccount.countDocuments(query),
    ]);
    return { accounts, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) };
};

export const getBankAccountForReview = async (accountId, { actorId, req }) => {
    const account = await BankAccount.findById(accountId)
        .populate('userId', 'firstName lastName email kycTier status')
        .populate('reviewedBy', 'firstName lastName email')
        .lean();
    if (!account) throw new DomainError('NOT_FOUND', 'Bank account not found', 404);

    const subjectId = account.userId?._id;
    const [documents, kyc, sharedWith] = await Promise.all([
        listDocuments({ purpose: BANK_DOCS, refId: account._id }),
        KycSubmission.findOne({ userId: subjectId }).select('status applicant.legalName').lean(),
        BankAccount.countDocuments({ accountNumberFingerprint: account.accountNumberFingerprint, userId: { $ne: subjectId }, status: { $ne: 'removed' } }),
    ]);

    audit(AUDIT.ADMIN_PII_ACCESSED, {
        userId: actorId, req,
        target: { type: 'BankAccount', id: String(account._id) },
        metadata: { resource: 'bank_account' },
    });

    const { accountNumberFingerprint, ...rest } = account;
    return {
        account: rest,
        documents,
        kyc: kyc ? { status: kyc.status, legalName: kyc.applicant?.legalName } : null,
        /** Exact after normalising case, spacing, punctuation and word order. A hint, not a decision. */
        nameMatchesKyc: Boolean(kyc?.applicant?.legalName) && nameKey(kyc.applicant.legalName) === nameKey(account.holderName),
        sharedWithOtherAccounts: sharedWith,
    };
};

export const readBankDocumentForReview = async (accountId, documentId, { actorId, req }) => {
    const file = await readDocument({ documentId, purpose: BANK_DOCS, refId: accountId });
    audit(AUDIT.KYC_DOCUMENT_VIEWED, {
        userId: actorId, req,
        target: { type: 'BankAccount', id: String(accountId) },
        metadata: { documentId: String(documentId), documentType: file.meta.type },
    });
    return file;
};

/** The full number, for the admin checking proof or sending money. Audited every time. */
export const revealAccountNumber = async (accountId, { actorId, req, context = 'review' }) => {
    const account = await BankAccount.findById(accountId).select('+accountNumberEncrypted accountNumberMasked').lean();
    if (!account) throw new DomainError('NOT_FOUND', 'Bank account not found', 404);
    audit(AUDIT.BANK_ACCOUNT_REVEALED, {
        userId: actorId, req,
        target: { type: 'BankAccount', id: String(accountId) },
        metadata: { accountNumberMasked: account.accountNumberMasked, context },
    });
    return decryptField(account.accountNumberEncrypted);
};

export const decideBankAccount = async (accountId, body = {}, { actorId, req }) => {
    const decision = ['verified', 'rejected'].includes(body.decision) ? body.decision : null;
    if (!decision) throw new DomainError('INVALID_DECISION', 'Choose verified or rejected', 400);
    const notes = str(body.notes, 1000);
    if (!notes || notes.length < 10) throw new DomainError('NOTES_REQUIRED', 'Record what you checked (at least 10 characters)', 400);
    const userVisibleReason = str(body.userVisibleReason, 500) || '';
    if (decision === 'rejected' && !userVisibleReason) throw new DomainError('REASON_REQUIRED', 'Write the reason the customer will see', 400);

    const existing = await BankAccount.findById(accountId).select('userId status').lean();
    if (!existing) throw new DomainError('NOT_FOUND', 'Bank account not found', 404);
    if (String(existing.userId) === String(actorId)) throw new DomainError('SELF_REVIEW', 'Another admin has to check your own bank account', 403);
    if (decision === 'verified' && !(await isVerified(existing.userId))) {
        throw new DomainError('KYC_NOT_VERIFIED', "Verify the customer's identity before their bank account", 409);
    }

    const account = await BankAccount.findOneAndUpdate(
        { _id: accountId, status: 'pending' },
        { $set: { status: decision, reviewedBy: actorId, reviewedAt: new Date(), reviewNotes: notes, userVisibleReason } },
        { new: true }
    );
    if (!account) throw new DomainError('ALREADY_REVIEWED', 'This account has already been reviewed', 409);

    audit(decision === 'verified' ? AUDIT.BANK_ACCOUNT_VERIFIED : AUDIT.BANK_ACCOUNT_REJECTED, {
        userId: actorId, req,
        target: { type: 'BankAccount', id: String(accountId) },
        metadata: { subjectUserId: String(account.userId), accountNumberMasked: account.accountNumberMasked },
    });

    const title = decision === 'verified' ? 'Bank account verified' : 'Bank account not verified';
    const text = decision === 'verified'
        ? `Your bank account ending ${account.accountNumberMasked.slice(-4)} is verified. You can now withdraw to it.`
        : `We could not verify your bank account ending ${account.accountNumberMasked.slice(-4)}: ${userVisibleReason}`;
    const user = await User.findById(account.userId).select('email firstName preferences').lean();
    notifyUser(account.userId, 'Account', title, text, { bankAccountId: String(account._id) }).catch(() => {});
    if (user) sendEmailAlert(user, 'accountUpdate', { title, body: text });

    return account;
};

// ---------------------------------------------------------------------------
// Withdrawals — the holder
// ---------------------------------------------------------------------------

const customerWithdrawal = (w) => ({
    _id: w._id,
    amount: fromPaise(w.amountMinor),
    amountMinor: w.amountMinor,
    status: w.status,
    bank: w.bank,
    payoutReference: w.status === 'paid' ? w.payoutReference : '',
    paidAt: w.paidAt,
    userVisibleReason: w.userVisibleReason,
    transactionId: w.transactionId,
    createdAt: w.createdAt,
    history: (w.statusHistory ?? []).map(({ from, to, at }) => ({ from, to, at })),
});

export const listMyWithdrawals = async (userId) => {
    const rows = await WithdrawalRequest.find({ userId }).sort({ createdAt: -1 }).limit(50).lean();
    return rows.map(customerWithdrawal);
};

/** What the Withdraw screen needs to decide which state to show. */
export const getEligibility = async (userId) => {
    const [verified, accounts, open] = await Promise.all([
        isVerified(userId),
        BankAccount.countDocuments({ userId, status: 'verified' }),
        WithdrawalRequest.countDocuments({ userId, status: { $in: OPEN_WITHDRAWAL_STATUSES } }),
    ]);
    return {
        kycVerified: verified,
        verifiedBankAccounts: accounts,
        openWithdrawals: open,
        maxOpenWithdrawals: MAX_OPEN_WITHDRAWALS,
        minAmount: MIN_WITHDRAWAL,
    };
};

const tell = (userId, user, title, body, metadata) => {
    notifyUser(userId, 'Transfer', title, body, metadata).catch(() => {});
    if (user) sendEmailAlert(user, 'withdrawalUpdate', { title, body });
};

export const requestWithdrawal = async (userId, body = {}, { req } = {}) => {
    const bankAccountId = typeof body.bankAccountId === 'string' && mongoose.isValidObjectId(body.bankAccountId) ? body.bankAccountId : null;
    if (!bankAccountId) throw new DomainError('ACCOUNT_REQUIRED', 'Choose a bank account', 400);

    const parsed = parseAmount(body.amount);
    if (!parsed.ok) throw new DomainError('INVALID_AMOUNT', parsed.error, 400);
    const amount = parsed.value;
    if (amount < MIN_WITHDRAWAL) throw new DomainError('BELOW_MINIMUM', `The minimum withdrawal is ${inr(MIN_WITHDRAWAL)}`, 400);

    if (!(await isVerified(userId))) {
        throw new DomainError('KYC_REQUIRED', 'Verify your identity before withdrawing to a bank account', 403);
    }

    const [user, account, openCount] = await Promise.all([
        User.findById(userId).select('email firstName preferences kycTier balanceMinor').lean(),
        BankAccount.findOne({ _id: bankAccountId, userId }).lean(),
        WithdrawalRequest.countDocuments({ userId, status: { $in: OPEN_WITHDRAWAL_STATUSES } }),
    ]);
    if (!account || account.status === 'removed') throw new DomainError('NOT_FOUND', 'Bank account not found', 404);
    if (account.status !== 'verified') throw new DomainError('ACCOUNT_NOT_VERIFIED', 'This bank account has not been verified yet', 409);
    if (openCount >= MAX_OPEN_WITHDRAWALS) {
        throw new DomainError('TOO_MANY_OPEN', `You already have ${openCount} withdrawals in progress. Wait for one to finish.`, 409);
    }
    if ((user?.balanceMinor ?? 0) < toPaise(amount)) throw new DomainError('INSUFFICIENT_FUNDS', 'Insufficient balance', 400);

    try {
        await checkTransferLimits({ userId, tier: user.kycTier, amount, noun: 'withdrawal' });
    } catch (err) {
        if (err instanceof LedgerError) {
            audit(AUDIT.LIMIT_EXCEEDED, { userId, outcome: 'failure', req, metadata: { amount, code: err.code, kind: 'withdrawal' } });
        }
        throw err;
    }

    const withdrawalId = new mongoose.Types.ObjectId();
    const bank = {
        holderName: account.holderName,
        accountNumberMasked: account.accountNumberMasked,
        ifsc: account.ifsc,
        bankName: account.bankName,
    };

    const { withdrawal, hold } = await runInTransaction(async (session) => {
        const held = await holdFunds({
            userId,
            amount,
            source: TX_SOURCE.WITHDRAWAL,
            category: 'Withdrawal',
            icon: 'Landmark',
            description: `Withdrawal to bank account ${account.accountNumberMasked}`,
            counterparty: { kind: 'self', name: `${account.bankName || account.ifsc} ${account.accountNumberMasked}` },
            extra: { paymentRef: `withdrawal:${withdrawalId}` },
            session,
        });
        const [created] = await WithdrawalRequest.create([{
            _id: withdrawalId,
            userId,
            bankAccountId,
            transactionId: held.transaction._id,
            amountMinor: toPaise(amount),
            bank,
            statusHistory: [{ from: null, to: 'requested', at: new Date(), actorId: userId, reason: 'Requested' }],
        }], { session });
        return { withdrawal: created, hold: held };
    });

    audit(AUDIT.WITHDRAWAL_REQUESTED, {
        userId, req,
        target: { type: 'WithdrawalRequest', id: String(withdrawal._id) },
        metadata: { amount, transactionId: String(hold.transaction._id), accountNumberMasked: bank.accountNumberMasked },
    });

    emitToUser(String(userId), 'wallet_update', { ...newBalanceFields(hold.user), transaction: hold.transaction });
    tell(userId, user, 'Withdrawal requested',
        `We have received your request to withdraw ${inr(amount)} to your bank account ending ${bank.accountNumberMasked.slice(-4)}. The money is held from your balance while we review it. If this was not you, contact support now.`,
        { withdrawalId: String(withdrawal._id), amount });

    User.find({ role: 'admin', status: 'active' }).select('_id').lean()
        .then((admins) => Promise.allSettled(admins.map((admin) => notifyUser(
            admin._id, 'System', 'Withdrawal awaiting review', `${inr(amount)} to a verified bank account.`,
            { withdrawalId: String(withdrawal._id) }, { dedupeKey: `withdrawal-requested:${withdrawal._id}` }
        ))))
        .catch(() => {});
    monitorAfterMovement(userId, { trigger: 'withdrawal' });

    return { withdrawal: customerWithdrawal(withdrawal.toObject()), ...newBalanceFields(hold.user) };
};

/**
 * The shared shape of every step that ends a withdrawal and returns its money:
 * the request moves (compare-and-set on `from`) and the hold is released, in
 * one transaction.
 */
const endAndRelease = async ({ withdrawalId, from, to, ledgerTo, actorId, reason, userVisibleReason = '', internalNotes = '', extraFilter = {} }) =>
    runInTransaction(async (session) => {
        const withdrawal = await WithdrawalRequest.findOneAndUpdate(
            { _id: withdrawalId, status: from, ...extraFilter },
            {
                $set: { status: to, userVisibleReason, ...(internalNotes && { internalNotes }), completedBy: actorId },
                $push: { statusHistory: { from, to, at: new Date(), actorId, reason } },
            },
            { new: true, session }
        );
        if (!withdrawal) return null;
        const released = await releaseHold({
            transactionId: withdrawal.transactionId,
            to: ledgerTo,
            reason,
            actor: String(actorId),
            failureReason: userVisibleReason || reason,
            session,
        });
        return { withdrawal, ...released };
    });

export const cancelWithdrawal = async (userId, withdrawalId, { req } = {}) => {
    const result = await endAndRelease({
        withdrawalId, from: 'requested', to: 'cancelled', ledgerTo: TX_STATUS.CANCELLED,
        actorId: userId, reason: 'Cancelled by the account holder', extraFilter: { userId },
    });
    if (!result) throw new DomainError('NOT_CANCELLABLE', 'This withdrawal can no longer be cancelled', 409);

    audit(AUDIT.WITHDRAWAL_CANCELLED, {
        userId, req,
        target: { type: 'WithdrawalRequest', id: String(withdrawalId) },
        metadata: { amount: fromPaise(result.withdrawal.amountMinor) },
    });
    emitToUser(String(userId), 'wallet_update', { ...newBalanceFields(result.user), transaction: result.transaction });
    return { withdrawal: customerWithdrawal(result.withdrawal.toObject()), ...newBalanceFields(result.user) };
};

// ---------------------------------------------------------------------------
// Withdrawals — the operator
// ---------------------------------------------------------------------------

export const listWithdrawals = async ({ status = 'requested', page = 1, limit = 25 } = {}) => {
    const query = status === 'all' ? {} : status === 'stuck'
        ? { status: 'processing', updatedAt: { $lt: new Date(Date.now() - STUCK_AFTER_HOURS * 3600 * 1000) } }
        : { status };
    const [withdrawals, total, held] = await Promise.all([
        WithdrawalRequest.find(query).sort({ createdAt: 1 }).skip((page - 1) * limit).limit(limit)
            .populate('userId', 'firstName lastName email').lean(),
        WithdrawalRequest.countDocuments(query),
        WithdrawalRequest.aggregate([
            { $match: { status: { $in: OPEN_WITHDRAWAL_STATUSES } } },
            { $group: { _id: '$status', count: { $sum: 1 }, totalMinor: { $sum: '$amountMinor' } } },
        ]),
    ]);
    return {
        withdrawals,
        total,
        page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        open: Object.fromEntries(held.map((h) => [h._id, { count: h.count, totalMinor: h.totalMinor }])),
    };
};

export const getWithdrawalForReview = async (withdrawalId, { actorId, req }) => {
    const withdrawal = await WithdrawalRequest.findById(withdrawalId)
        .populate('userId', 'firstName lastName email status kycTier createdAt')
        .populate('approvedBy completedBy', 'firstName lastName email')
        .populate('statusHistory.actorId', 'firstName lastName email')
        .lean();
    if (!withdrawal) throw new DomainError('NOT_FOUND', 'Withdrawal not found', 404);

    const subjectId = withdrawal.userId?._id;
    const [account, kyc, amlAlerts, recent, transaction] = await Promise.all([
        BankAccount.findById(withdrawal.bankAccountId).select('status holderName accountNumberMasked ifsc bankName reviewedAt').lean(),
        KycSubmission.findOne({ userId: subjectId }).select('status applicant.legalName grantedTier').lean(),
        listUserAlerts(subjectId, { limit: 10 }),
        Transaction.find({ userId: subjectId }).sort({ createdAt: -1 }).limit(10)
            .select('description amount amountMinor type category status source createdAt').lean(),
        Transaction.findById(withdrawal.transactionId).select('status invoiceId statusHistory').lean(),
    ]);

    audit(AUDIT.ADMIN_PII_ACCESSED, {
        userId: actorId, req,
        target: { type: 'WithdrawalRequest', id: String(withdrawal._id) },
        metadata: { resource: 'withdrawal' },
    });

    return {
        withdrawal: { ...withdrawal, isOwn: String(subjectId) === String(actorId) },
        account,
        kyc: kyc ? { status: kyc.status, legalName: kyc.applicant?.legalName, grantedTier: kyc.grantedTier } : null,
        amlAlerts,
        recentTransactions: recent,
        transaction,
    };
};

const refuseOwn = async (withdrawalId, actorId) => {
    const existing = await WithdrawalRequest.findById(withdrawalId).select('userId status bankAccountId').lean();
    if (!existing) throw new DomainError('NOT_FOUND', 'Withdrawal not found', 404);
    if (String(existing.userId) === String(actorId)) {
        throw new DomainError('SELF_REVIEW', 'Another admin has to process your own withdrawal', 403);
    }
    return existing;
};

/**
 * Approve: the operator is about to send the money. Re-checks identity and the
 * destination *now*, because either could have been revoked since the request.
 */
export const approveWithdrawal = async (withdrawalId, { actorId, req }) => {
    const existing = await refuseOwn(withdrawalId, actorId);
    if (!(await isVerified(existing.userId))) throw new DomainError('KYC_NOT_VERIFIED', "The customer's identity is no longer verified. Reject this withdrawal.", 409);
    const account = await BankAccount.findById(existing.bankAccountId).select('status').lean();
    if (account?.status !== 'verified') throw new DomainError('ACCOUNT_NOT_VERIFIED', 'The destination account is no longer verified. Reject this withdrawal.', 409);

    const withdrawal = await runInTransaction(async (session) => {
        const updated = await WithdrawalRequest.findOneAndUpdate(
            { _id: withdrawalId, status: 'requested' },
            {
                $set: { status: 'processing', approvedBy: actorId, approvedAt: new Date() },
                $push: { statusHistory: { from: 'requested', to: 'processing', at: new Date(), actorId, reason: 'Approved; bank transfer started' } },
            },
            { new: true, session }
        );
        if (!updated) return null;
        await advanceHold({ transactionId: updated.transactionId, from: TX_STATUS.PENDING, to: TX_STATUS.PROCESSING, reason: 'Approved for payout', actor: String(actorId), session });
        return updated;
    });
    if (!withdrawal) throw new DomainError('NOT_REQUESTED', 'This withdrawal is no longer waiting for approval', 409);

    audit(AUDIT.WITHDRAWAL_APPROVED, {
        userId: actorId, req,
        target: { type: 'WithdrawalRequest', id: String(withdrawal._id) },
        metadata: { subjectUserId: String(withdrawal.userId), amount: fromPaise(withdrawal.amountMinor) },
    });
    const user = await User.findById(withdrawal.userId).select('email firstName preferences').lean();
    tell(withdrawal.userId, user, 'Withdrawal approved',
        `Your withdrawal of ${inr(fromPaise(withdrawal.amountMinor))} has been approved and is being sent to your bank account ending ${withdrawal.bank.accountNumberMasked.slice(-4)}.`,
        { withdrawalId: String(withdrawal._id) });
    return withdrawal;
};

/** UTR-style bank references: letters and digits, 6–30 characters. */
const parseReference = (raw) => {
    const reference = typeof raw === 'string' ? raw.replace(/\s/g, '').toUpperCase() : '';
    return /^[A-Z0-9]{6,30}$/.test(reference) ? reference : null;
};

/** The money has left the business bank account; record the bank's reference. */
export const markWithdrawalPaid = async (withdrawalId, body = {}, { actorId, req }) => {
    const reference = parseReference(body.reference);
    if (!reference) throw new DomainError('REFERENCE_REQUIRED', 'Enter the bank reference (UTR) for the transfer', 400);
    await refuseOwn(withdrawalId, actorId);
    if (await WithdrawalRequest.exists({ payoutReference: reference, _id: { $ne: withdrawalId } })) {
        throw new DomainError('REFERENCE_USED', 'That bank reference is already recorded on another withdrawal', 409);
    }

    const withdrawal = await runInTransaction(async (session) => {
        const updated = await WithdrawalRequest.findOneAndUpdate(
            { _id: withdrawalId, status: 'processing' },
            {
                $set: { status: 'paid', payoutReference: reference, paidAt: new Date(), completedBy: actorId },
                $push: { statusHistory: { from: 'processing', to: 'paid', at: new Date(), actorId, reason: 'Bank transfer completed' } },
            },
            { new: true, session }
        );
        if (!updated) return null;
        await advanceHold({ transactionId: updated.transactionId, from: TX_STATUS.PROCESSING, to: TX_STATUS.SUCCESS, reason: `Paid, UTR ${reference}`, actor: String(actorId), session });
        return updated;
    });
    if (!withdrawal) throw new DomainError('NOT_PROCESSING', 'Only an approved withdrawal can be marked paid', 409);

    audit(AUDIT.WITHDRAWAL_PAID, {
        userId: actorId, req,
        target: { type: 'WithdrawalRequest', id: String(withdrawal._id) },
        metadata: { subjectUserId: String(withdrawal.userId), amount: fromPaise(withdrawal.amountMinor), reference },
    });
    const user = await User.findById(withdrawal.userId).select('email firstName preferences').lean();
    tell(withdrawal.userId, user, 'Withdrawal sent',
        `${inr(fromPaise(withdrawal.amountMinor))} was sent to your bank account ending ${withdrawal.bank.accountNumberMasked.slice(-4)}. Bank reference: ${reference}. It can take up to a working day to appear.`,
        { withdrawalId: String(withdrawal._id) });
    return withdrawal;
};

const endByOperator = async ({ withdrawalId, body, actorId, req, from, to, ledgerTo, auditAction, title, verb }) => {
    const userVisibleReason = str(body.userVisibleReason, 500);
    if (!userVisibleReason) throw new DomainError('REASON_REQUIRED', 'Write the reason the customer will see', 400);
    await refuseOwn(withdrawalId, actorId);

    const result = await endAndRelease({
        withdrawalId, from, to, ledgerTo, actorId,
        reason: `${verb}: ${userVisibleReason}`,
        userVisibleReason,
        internalNotes: str(body.notes, 1000) || '',
    });
    if (!result) throw new DomainError('WRONG_STATUS', `Only a ${from} withdrawal can be ${to}`, 409);

    audit(auditAction, {
        userId: actorId, req,
        target: { type: 'WithdrawalRequest', id: String(withdrawalId) },
        metadata: { subjectUserId: String(result.withdrawal.userId), amount: fromPaise(result.withdrawal.amountMinor) },
    });
    emitToUser(String(result.withdrawal.userId), 'wallet_update', { ...newBalanceFields(result.user), transaction: result.transaction });
    const user = await User.findById(result.withdrawal.userId).select('email firstName preferences').lean();
    tell(result.withdrawal.userId, user, title,
        `Your withdrawal of ${inr(fromPaise(result.withdrawal.amountMinor))} was ${to === 'failed' ? 'not completed by the bank' : 'not approved'}: ${userVisibleReason} The money is back in your PayPro balance.`,
        { withdrawalId: String(withdrawalId) });
    return result.withdrawal;
};

/** Refuse before any money is sent. The hold is released. */
export const rejectWithdrawal = (withdrawalId, body = {}, { actorId, req }) => endByOperator({
    withdrawalId, body, actorId, req,
    from: 'requested', to: 'rejected', ledgerTo: TX_STATUS.CANCELLED,
    auditAction: AUDIT.WITHDRAWAL_REJECTED, title: 'Withdrawal not approved', verb: 'Rejected',
});

/**
 * The bank did not complete the transfer (returned, bounced, wrong details).
 * Only from `processing`: once marked paid, a later bank return is a manual
 * adjustment, because the ledger already says the money left.
 */
export const failWithdrawal = (withdrawalId, body = {}, { actorId, req }) => endByOperator({
    withdrawalId, body, actorId, req,
    from: 'processing', to: 'failed', ledgerTo: TX_STATUS.FAILED,
    auditAction: AUDIT.WITHDRAWAL_FAILED, title: 'Withdrawal failed', verb: 'Failed',
});

/** The destination account number, for the operator making the transfer. */
export const revealWithdrawalDestination = async (withdrawalId, { actorId, req }) => {
    const withdrawal = await WithdrawalRequest.findById(withdrawalId).select('bankAccountId status userId').lean();
    if (!withdrawal) throw new DomainError('NOT_FOUND', 'Withdrawal not found', 404);
    if (String(withdrawal.userId) === String(actorId)) throw new DomainError('SELF_REVIEW', 'Another admin has to process your own withdrawal', 403);
    return revealAccountNumber(withdrawal.bankAccountId, { actorId, req, context: `withdrawal:${withdrawalId}` });
};

/**
 * Match a bank statement against paid withdrawals (plan.md §0.20.3
 * "reconciliation against the bank or payout statement").
 *
 * CSV with a `reference` (or `utr`) column and an `amount` column in rupees.
 * Read-only apart from stamping `statementMatchedAt` on exact matches. Reports:
 *   - matched: reference and amount both agree;
 *   - amountMismatch: the reference is ours but the amount differs — investigate;
 *   - unknown: a statement debit with no withdrawal behind it — investigate;
 *   - unmatchedPaid: withdrawals PayPro marked paid that no statement has shown yet.
 */
export const matchStatement = async ({ csvText, actorId, req }) => {
    const rows = parseCsv(String(csvText ?? '').replace(/^﻿/, ''));
    if (rows.length < 2) throw new DomainError('EMPTY_STATEMENT', 'The file needs a header row and at least one line', 400);
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const refCol = header.findIndex((h) => ['reference', 'utr', 'ref', 'utr number'].includes(h));
    const amountCol = header.findIndex((h) => ['amount', 'debit', 'withdrawal amount'].includes(h));
    if (refCol === -1 || amountCol === -1) {
        throw new DomainError('BAD_HEADER', 'The header row must have "reference" (or "utr") and "amount" columns', 400);
    }
    if (rows.length > 10_001) throw new DomainError('STATEMENT_TOO_LARGE', 'A statement can have at most 10,000 lines', 413);

    const lines = rows.slice(1).map((cells) => ({
        reference: parseReference(cells[refCol]),
        amountMinor: toPaise(Number(String(cells[amountCol] ?? '').replace(/[,₹\s]/g, ''))),
    })).filter((l) => l.reference);

    const known = await WithdrawalRequest.find({ payoutReference: { $in: lines.map((l) => l.reference) } })
        .select('payoutReference amountMinor status userId statementMatchedAt').lean();
    const byRef = new Map(known.map((w) => [w.payoutReference, w]));

    const matched = [];
    const amountMismatch = [];
    const unknown = [];
    for (const line of lines) {
        const w = byRef.get(line.reference);
        if (!w) unknown.push(line);
        else if (w.amountMinor !== line.amountMinor) amountMismatch.push({ ...line, withdrawalId: w._id, expectedMinor: w.amountMinor });
        else matched.push({ ...line, withdrawalId: w._id });
    }

    if (matched.length) {
        await WithdrawalRequest.updateMany(
            { _id: { $in: matched.map((m) => m.withdrawalId) }, statementMatchedAt: null },
            { $set: { statementMatchedAt: new Date() } }
        );
    }
    const unmatchedPaid = await WithdrawalRequest.find({ status: 'paid', statementMatchedAt: null })
        .sort({ paidAt: 1 }).limit(100).select('payoutReference amountMinor paidAt userId').populate('userId', 'firstName lastName email').lean();

    audit(AUDIT.WITHDRAWAL_STATEMENT_MATCHED, {
        userId: actorId, req,
        metadata: { lines: lines.length, matched: matched.length, amountMismatch: amountMismatch.length, unknown: unknown.length, unmatchedPaid: unmatchedPaid.length },
    });

    return { lines: lines.length, matched, amountMismatch, unknown, unmatchedPaid };
};

export default {
    listBankAccounts, addBankAccount, addBankDocument, removeBankAccount,
    listBankAccountQueue, getBankAccountForReview, readBankDocumentForReview, revealAccountNumber, decideBankAccount,
    listMyWithdrawals, getEligibility, requestWithdrawal, cancelWithdrawal,
    listWithdrawals, getWithdrawalForReview, approveWithdrawal, markWithdrawalPaid, rejectWithdrawal, failWithdrawal,
    revealWithdrawalDestination, matchStatement,
};
