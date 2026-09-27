import express from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import { requireRole } from '../middlewares/requireRole.js';
import { adminLimiter } from '../middlewares/rateLimiters.js';
import { idempotency } from '../middlewares/idempotency.js';
import { requireStaffTotp } from '../middlewares/requireStaffTotp.js';
import {
    getMetrics,
    getReconciliationReport,
    repairAccount,
    listUsers,
    updateUserRole,
    suspendUser,
    reactivateUser,
    getWebhookEvents,
    getMinorVerification,
    getAuditLogs,
    getRiskQueue,
    getRiskCase,
    postRiskDecision,
    getUserDetail,
    forceLogoutUser,
    searchTransactions,
    getTransactionDetail,
    listPayments,
    resettlePayment,
    replayWebhook,
    createAdjustment,
    resetUserTwoFactor,
    postRiskEscalation,
} from '../controllers/adminController.js';
import {
    getSupportQueue,
    getQueueTicket,
    postAgentReply,
    postAgentAssign,
    postAgentResolve,
} from '../controllers/supportController.js';
import {
    getKycQueue, getKycSubmission, postKycClaim, postKycRelease, postKycDecision, postKycRevoke, getKycDocument, getKycPan,
    getAmlAlerts, getAmlAlert, postAmlClose, getWatchlists, postWatchlist,
    getBankAccountQueue, getBankAccount, getBankAccountNumber, getBankDocument, postBankAccountDecision,
    getWithdrawalQueue, getWithdrawal, getWithdrawalDestination, postWithdrawalApprove, postWithdrawalPaid,
    postWithdrawalReject, postWithdrawalFail, postWithdrawalStatement,
} from '../controllers/complianceController.js';

const adminRouter = express.Router();

/** CSV uploads to the console (a watchlist, a bank statement): up to 5 MB of text. */
const csvBody = express.text({ type: ['text/csv', 'text/plain', 'application/csv'], limit: '5mb' });

// Every route here needs an authenticated, non-suspended session, an
// authenticator app (§28.3 rule 5), AND a role.
adminRouter.use(authMiddleware, adminLimiter, requireStaffTotp);

adminRouter.get('/metrics', requireRole('admin', 'support', 'risk'), getMetrics);

adminRouter.get('/reconciliation/report', requireRole('admin', 'risk'), getReconciliationReport);
adminRouter.post('/reconciliation/repair/:userId', requireRole('admin'), repairAccount);
adminRouter.get('/reconciliation/minor', requireRole('admin', 'risk'), getMinorVerification);

// Support is excluded: the trail spans every account's security events, and
// answering a ticket never needs more than that one user's own history.
adminRouter.get('/audit-logs', requireRole('admin', 'risk'), getAuditLogs);

adminRouter.get('/users', requireRole('admin', 'support', 'risk'), listUsers);
adminRouter.patch('/users/:userId/role', requireRole('admin'), updateUserRole);
adminRouter.post('/users/:userId/suspend', requireRole('admin', 'risk'), suspendUser);
adminRouter.post('/users/:userId/reactivate', requireRole('admin', 'risk'), reactivateUser);
adminRouter.get('/users/:userId', requireRole('admin', 'support', 'risk'), getUserDetail);
// Same roles as suspend: cutting off a compromised account is risk's job too.
adminRouter.post('/users/:userId/logout-all', requireRole('admin', 'risk'), forceLogoutUser);
/**
 * Reset 2FA (§28.2): the last step of authenticator recovery, after the holder
 * has lost both the app and their recovery codes. Admin only: it removes a
 * factor, and identity checks for it belong with the most senior role.
 */
adminRouter.post('/users/:userId/reset-2fa', requireRole('admin'), resetUserTwoFactor);

/**
 * Cross-user transaction search (plan.md §28.2). Support is included: answering
 * "where is my money" needs the row. Reads only — nothing here changes one.
 */
adminRouter.get('/transactions', requireRole('admin', 'support', 'risk'), searchTransactions);
adminRouter.get('/transactions/:id', requireRole('admin', 'support', 'risk'), getTransactionDetail);

/** Payments. Re-settling credits a wallet, so it is admin-only (§28.3 rule 3). */
adminRouter.get('/payments', requireRole('admin', 'support', 'risk'), listPayments);
adminRouter.post('/payments/:orderId/resettle', requireRole('admin'), resettlePayment);

/**
 * Manual adjustments (§28.2). Admin only, re-authenticated in the controller,
 * and a money route like any other — so it claims an idempotency key first.
 */
adminRouter.post('/adjustments', requireRole('admin'), idempotency('admin_adjustment'), createAdjustment);

adminRouter.get('/webhooks', requireRole('admin', 'support'), getWebhookEvents);
// Replaying can settle money, so support can see a stuck event but not re-run it.
adminRouter.post('/webhooks/:id/replay', requireRole('admin'), replayWebhook);

/**
 * Risk queue (plan.md §28.2, §30.2.3). 'risk' and 'admin' only — support can
 * see a ticket about a held transfer but must not be able to release the money.
 */
adminRouter.get('/risk/cases', requireRole('admin', 'risk'), getRiskQueue);
adminRouter.get('/risk/cases/:id', requireRole('admin', 'risk'), getRiskCase);
adminRouter.post('/risk/cases/:id/decision', requireRole('admin', 'risk'), postRiskDecision);
// Hand a case up to an admin. Once escalated, only an admin can decide it.
adminRouter.post('/risk/cases/:id/escalate', requireRole('admin', 'risk'), postRiskEscalation);

// ---------------------------------------------------------------------------
// Phase 5 (plan.md §0.20). Identity decisions and anything that lets money leave
// are admin only (the 2026-09-27 decision: no separate compliance role yet).
// AML alerts are also worked by risk, who already own fraud review; importing a
// list is admin only. Every body parser sits after `requireRole`, so a caller
// without the role is refused before a 5 MB body is read.
// ---------------------------------------------------------------------------

/** KYC review queue (§0.20.2). */
adminRouter.get('/kyc', requireRole('admin'), getKycQueue);
adminRouter.get('/kyc/:id', requireRole('admin'), getKycSubmission);
adminRouter.post('/kyc/:id/claim', requireRole('admin'), postKycClaim);
adminRouter.post('/kyc/:id/release', requireRole('admin'), postKycRelease);
adminRouter.post('/kyc/:id/decision', requireRole('admin'), postKycDecision);
adminRouter.post('/kyc/:id/revoke', requireRole('admin'), postKycRevoke);
adminRouter.get('/kyc/:id/documents/:documentId', requireRole('admin'), getKycDocument);
adminRouter.get('/kyc/:id/pan', requireRole('admin'), getKycPan);

/** AML monitoring, shadow mode (§30.3). */
adminRouter.get('/aml/alerts', requireRole('admin', 'risk'), getAmlAlerts);
adminRouter.get('/aml/alerts/:id', requireRole('admin', 'risk'), getAmlAlert);
adminRouter.post('/aml/alerts/:id/close', requireRole('admin', 'risk'), postAmlClose);
adminRouter.get('/aml/watchlists', requireRole('admin', 'risk'), getWatchlists);
adminRouter.post('/aml/watchlists', requireRole('admin'), csvBody, postWatchlist);

/** Withdrawal destinations (§0.20.3). */
adminRouter.get('/bank-accounts', requireRole('admin'), getBankAccountQueue);
adminRouter.get('/bank-accounts/:id', requireRole('admin'), getBankAccount);
adminRouter.get('/bank-accounts/:id/account-number', requireRole('admin'), getBankAccountNumber);
adminRouter.get('/bank-accounts/:id/documents/:documentId', requireRole('admin'), getBankDocument);
adminRouter.post('/bank-accounts/:id/decision', requireRole('admin'), postBankAccountDecision);

/** Withdrawals, paid by an operator's bank transfer (§0.20.3). */
adminRouter.get('/withdrawals', requireRole('admin'), getWithdrawalQueue);
adminRouter.post('/withdrawals/statement', requireRole('admin'), csvBody, postWithdrawalStatement);
adminRouter.get('/withdrawals/:id', requireRole('admin'), getWithdrawal);
adminRouter.get('/withdrawals/:id/destination', requireRole('admin'), getWithdrawalDestination);
adminRouter.post('/withdrawals/:id/approve', requireRole('admin'), postWithdrawalApprove);
adminRouter.post('/withdrawals/:id/paid', requireRole('admin'), postWithdrawalPaid);
adminRouter.post('/withdrawals/:id/reject', requireRole('admin'), postWithdrawalReject);
adminRouter.post('/withdrawals/:id/fail', requireRole('admin'), postWithdrawalFail);

/** Support queue (plan.md §27.2). */
adminRouter.get('/support/tickets', requireRole('admin', 'support'), getSupportQueue);
adminRouter.get('/support/tickets/:id', requireRole('admin', 'support'), getQueueTicket);
adminRouter.post('/support/tickets/:id/messages', requireRole('admin', 'support'), postAgentReply);
adminRouter.post('/support/tickets/:id/assign', requireRole('admin', 'support'), postAgentAssign);
adminRouter.post('/support/tickets/:id/resolve', requireRole('admin', 'support'), postAgentResolve);

export default adminRouter;
