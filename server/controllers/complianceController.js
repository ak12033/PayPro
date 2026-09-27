import { asyncHandler } from '../utils/asyncHandler.js';
import { asObjectId, asString, asInt, asEnum } from '../utils/sanitize.js';
import { DomainError } from '../utils/domainError.js';
import { requireReauth } from '../utils/requireReauth.js';
import { sendDocument } from '../utils/fileUpload.js';
import { KYC_STATUSES } from '../constants/kyc.js';
import { AML_RULES, AML_DISPOSITIONS } from '../models/AmlAlert.js';
import { WITHDRAWAL_STATUSES } from '../models/WithdrawalRequest.js';
import { BANK_ACCOUNT_STATUSES } from '../models/BankAccount.js';
import kyc from '../services/kycService.js';
import aml from '../services/amlService.js';
import withdrawals from '../services/withdrawalService.js';

/**
 * The Phase 5 operations console endpoints (plan.md §0.20): KYC review, AML
 * alerts and watchlists, bank-account verification, and the withdrawal queue.
 * Mounted under /api/admin, behind the same authMiddleware + staff-2FA +
 * requireRole stack as the rest of the console (adminRoutes.js says who may call
 * what).
 *
 * Re-authentication (§28.3 rule 4) is asked for on every step that records an
 * identity decision or lets money leave: KYC decide/revoke, bank-account
 * decisions, and withdrawal approve / mark paid / mark failed. Routine reads
 * and queue work (claiming a submission, closing an AML alert, rejecting a
 * withdrawal, which only returns money) do not ask, for the same reason the risk
 * queue does not.
 */

const id = (value, what = 'record') => {
    const parsed = asObjectId(value);
    if (!parsed) throw new DomainError('INVALID_ID', `A valid ${what} id is required`, 400);
    return parsed;
};
const page = (req) => asInt(req.query.page, { min: 1, max: 100000, fallback: 1 });
const ctx = (req) => ({ actorId: req.user.id, req });

// ---------------------------------------------------------------------------
// KYC review (admin only)
// ---------------------------------------------------------------------------

export const getKycQueue = asyncHandler(async (req, res) => {
    const status = asEnum(req.query.status, [...KYC_STATUSES, 'all'], 'PENDING');
    res.status(200).json(await kyc.listQueue({ status, page: page(req) }));
});

export const getKycSubmission = asyncHandler(async (req, res) => {
    res.status(200).json(await kyc.getForReview(id(req.params.id, 'submission'), ctx(req)));
});

export const postKycClaim = asyncHandler(async (req, res) => {
    res.status(200).json({ submission: await kyc.claim(id(req.params.id, 'submission'), ctx(req)) });
});

export const postKycRelease = asyncHandler(async (req, res) => {
    const reason = asString(req.body?.reason, { maxLength: 500 }) || '';
    res.status(200).json({ submission: await kyc.release(id(req.params.id, 'submission'), { ...ctx(req), reason }) });
});

/** "Mark as Verified" / "Reject" / "Request action". Re-authenticated. */
export const postKycDecision = asyncHandler(async (req, res) => {
    const submissionId = id(req.params.id, 'submission');
    const actor = await requireReauth(req, res);
    if (!actor) return;
    const { submission, decision } = await kyc.decide(submissionId, req.body ?? {}, ctx(req));
    res.status(200).json({ submission: { _id: submission._id, status: submission.status, grantedTier: submission.grantedTier }, decisionId: decision._id });
});

export const postKycRevoke = asyncHandler(async (req, res) => {
    const submissionId = id(req.params.id, 'submission');
    const actor = await requireReauth(req, res);
    if (!actor) return;
    const { submission, decision } = await kyc.revoke(submissionId, req.body ?? {}, ctx(req));
    res.status(200).json({ submission: { _id: submission._id, status: submission.status }, decisionId: decision._id });
});

export const getKycDocument = asyncHandler(async (req, res) => {
    sendDocument(res, await kyc.readDocumentForReview(id(req.params.id, 'submission'), id(req.params.documentId, 'document'), ctx(req)));
});

export const getKycPan = asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store, private');
    res.status(200).json({ pan: await kyc.revealPan(id(req.params.id, 'submission'), ctx(req)) });
});

// ---------------------------------------------------------------------------
// AML (admin + risk; importing a list is admin only)
// ---------------------------------------------------------------------------

export const getAmlAlerts = asyncHandler(async (req, res) => {
    const status = asEnum(req.query.status, ['open', 'closed', 'all'], 'open');
    const rule = asEnum(req.query.rule, AML_RULES);
    res.status(200).json(await aml.listAlerts({ status, rule, page: page(req) }));
});

export const getAmlAlert = asyncHandler(async (req, res) => {
    res.status(200).json(await aml.getAlert(id(req.params.id, 'alert')));
});

export const postAmlClose = asyncHandler(async (req, res) => {
    const disposition = asEnum(req.body?.disposition, AML_DISPOSITIONS);
    if (!disposition) throw new DomainError('INVALID_DISPOSITION', 'Choose false positive, no action, or suspicious', 400);
    const notes = asString(req.body?.notes, { maxLength: 2000 });
    if (!notes || notes.length < 10) throw new DomainError('NOTES_REQUIRED', 'Record what you looked at (at least 10 characters)', 400);
    const reportDraft = asString(req.body?.reportDraft, { maxLength: 5000 }) || '';
    if (disposition === 'suspicious' && reportDraft.length < 20) {
        throw new DomainError('DRAFT_REQUIRED', 'Draft the internal report for a suspicious disposition (at least 20 characters)', 400);
    }
    const alert = await aml.closeAlert({ alertId: id(req.params.id, 'alert'), actorId: req.user.id, disposition, notes, reportDraft, req });
    res.status(200).json({ alert });
});

export const getWatchlists = asyncHandler(async (req, res) => {
    res.status(200).json({ watchlists: await aml.listWatchlists() });
});

/**
 * The CSV is the request body (`Content-Type: text/csv`, up to 5 MB); the list's
 * name and source travel in the query string. A published list is too large for
 * the global 100 KB JSON limit, and a JSON wrapper around it would only add an
 * escaping step.
 */
export const postWatchlist = asyncHandler(async (req, res) => {
    const name = asString(req.query.name, { maxLength: 120 });
    const source = asString(req.query.source, { maxLength: 300 });
    if (!name || !source) throw new DomainError('INVALID_INPUT', 'Name the list and say where it was published', 400);
    if (typeof req.body !== 'string' || !req.body.trim()) throw new DomainError('EMPTY_LIST', 'Attach the list as CSV', 400);
    res.status(201).json(await aml.importWatchlist({ name, source, csvText: req.body, actorId: req.user.id, req }));
});

// ---------------------------------------------------------------------------
// Bank accounts (admin only)
// ---------------------------------------------------------------------------

export const getBankAccountQueue = asyncHandler(async (req, res) => {
    const status = asEnum(req.query.status, [...BANK_ACCOUNT_STATUSES, 'all'], 'pending');
    res.status(200).json(await withdrawals.listBankAccountQueue({ status, page: page(req) }));
});

export const getBankAccount = asyncHandler(async (req, res) => {
    res.status(200).json(await withdrawals.getBankAccountForReview(id(req.params.id, 'bank account'), ctx(req)));
});

export const getBankAccountNumber = asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store, private');
    res.status(200).json({ accountNumber: await withdrawals.revealAccountNumber(id(req.params.id, 'bank account'), ctx(req)) });
});

export const getBankDocument = asyncHandler(async (req, res) => {
    sendDocument(res, await withdrawals.readBankDocumentForReview(id(req.params.id, 'bank account'), id(req.params.documentId, 'document'), ctx(req)));
});

export const postBankAccountDecision = asyncHandler(async (req, res) => {
    const accountId = id(req.params.id, 'bank account');
    const actor = await requireReauth(req, res);
    if (!actor) return;
    const account = await withdrawals.decideBankAccount(accountId, req.body ?? {}, ctx(req));
    res.status(200).json({ account: { _id: account._id, status: account.status } });
});

// ---------------------------------------------------------------------------
// Withdrawals (admin only)
// ---------------------------------------------------------------------------

export const getWithdrawalQueue = asyncHandler(async (req, res) => {
    const status = asEnum(req.query.status, [...WITHDRAWAL_STATUSES, 'stuck', 'all'], 'requested');
    res.status(200).json(await withdrawals.listWithdrawals({ status, page: page(req) }));
});

export const getWithdrawal = asyncHandler(async (req, res) => {
    res.status(200).json(await withdrawals.getWithdrawalForReview(id(req.params.id, 'withdrawal'), ctx(req)));
});

export const getWithdrawalDestination = asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store, private');
    res.status(200).json({ accountNumber: await withdrawals.revealWithdrawalDestination(id(req.params.id, 'withdrawal'), ctx(req)) });
});

export const postWithdrawalApprove = asyncHandler(async (req, res) => {
    const withdrawalId = id(req.params.id, 'withdrawal');
    const actor = await requireReauth(req, res);
    if (!actor) return;
    res.status(200).json({ withdrawal: await withdrawals.approveWithdrawal(withdrawalId, ctx(req)) });
});

export const postWithdrawalPaid = asyncHandler(async (req, res) => {
    const withdrawalId = id(req.params.id, 'withdrawal');
    const actor = await requireReauth(req, res);
    if (!actor) return;
    res.status(200).json({ withdrawal: await withdrawals.markWithdrawalPaid(withdrawalId, req.body ?? {}, ctx(req)) });
});

export const postWithdrawalReject = asyncHandler(async (req, res) => {
    res.status(200).json({ withdrawal: await withdrawals.rejectWithdrawal(id(req.params.id, 'withdrawal'), req.body ?? {}, ctx(req)) });
});

/** Returns money, but also asserts "the bank did not pay", so it is re-authenticated like "paid". */
export const postWithdrawalFail = asyncHandler(async (req, res) => {
    const withdrawalId = id(req.params.id, 'withdrawal');
    const actor = await requireReauth(req, res);
    if (!actor) return;
    res.status(200).json({ withdrawal: await withdrawals.failWithdrawal(withdrawalId, req.body ?? {}, ctx(req)) });
});

/** Match a bank statement (CSV body, like a watchlist import). */
export const postWithdrawalStatement = asyncHandler(async (req, res) => {
    if (typeof req.body !== 'string' || !req.body.trim()) throw new DomainError('EMPTY_STATEMENT', 'Attach the statement as CSV', 400);
    res.status(200).json(await withdrawals.matchStatement({ csvText: req.body, actorId: req.user.id, req }));
});
