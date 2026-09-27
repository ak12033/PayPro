import mongoose from 'mongoose';

/**
 * Immutable-by-convention audit trail.
 *
 * The application had no audit log at all. For a system that moves money that
 * is a compliance gap as much as an engineering one: after an incident there
 * was no way to answer "who changed this password", "where was this transfer
 * initiated from", or "was this refund issued by the user or by the gateway".
 * The Transaction collection records what happened to a *balance*, but nothing
 * recorded security-relevant actions or their origin.
 */
const auditLogSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    action: { type: String, required: true },
    /**
     * 'success' | 'failure'. Failed attempts matter more than successful ones
     * for detecting credential stuffing and enumeration.
     */
    outcome: { type: String, enum: ['success', 'failure'], default: 'success' },
    /** Resource touched, e.g. { type: 'Transaction', id: '...' } */
    target: {
        type: { type: String },
        id: { type: String },
    },
    ip: String,
    userAgent: String,
    requestId: String,
    /** Non-sensitive extra context. Never store credentials or OTPs here. */
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
    timestamps: { createdAt: true, updatedAt: false },
    // Audit rows are append-only; nothing should ever mutate one.
    minimize: false,
});

auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ outcome: 1, action: 1, createdAt: -1 });

/**
 * Retention: 400 days.
 *
 * Long enough to cover a full annual review cycle plus dispute windows, short
 * enough that the collection does not grow without bound.
 */
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 400 * 24 * 60 * 60 });

export const AUDIT = {
    LOGIN_SUCCESS: 'auth.login.success',
    LOGIN_FAILED: 'auth.login.failed',
    LOGIN_LOCKED: 'auth.login.locked',
    LOGIN_2FA_REQUIRED: 'auth.login.2fa_required',
    LOGIN_2FA_VERIFIED: 'auth.login.2fa_verified',
    LOGOUT: 'auth.logout',
    LOGOUT_ALL: 'auth.logout_all',
    REGISTER: 'auth.register',
    TOKEN_REUSE_DETECTED: 'auth.token_reuse_detected',
    DEVICE_TRUSTED: 'security.device.trusted',
    DEVICE_REVOKED: 'security.device.revoked',
    DEVICE_RENAMED: 'security.device.renamed',
    DEVICES_REVOKED_ALL: 'security.device.revoked_all',
    PASSWORD_CHANGED: 'user.password_changed',
    EMAIL_CHANGED: 'user.email_changed',
    SETTINGS_CHANGED: 'user.settings_changed',
    TRANSFER_SENT: 'wallet.transfer.sent',
    TRANSFER_2FA_REQUIRED: 'wallet.transfer.2fa_required',
    TRANSFER_FAILED: 'wallet.transfer.failed',
    TRANSACTION_ADDED: 'wallet.transaction.added',
    TRANSACTION_RECATEGORISED: 'wallet.transaction.recategorised',
    TOPUP_CAPTURED: 'payment.topup.captured',
    TOPUP_INITIATED: 'payment.topup.initiated',
    TOPUP_FAILED: 'payment.topup.failed',
    REFUND_ISSUED: 'payment.refund.issued',
    WEBHOOK_REJECTED: 'payment.webhook.rejected',
    HIGH_RISK_FLAGGED: 'security.high_risk_flagged',
    PASSWORD_RESET_REQUESTED: 'auth.password_reset.requested',
    PASSWORD_RESET_COMPLETED: 'auth.password_reset.completed',
    WEBHOOK_RECEIVED: 'payment.webhook.received',
    WEBHOOK_DUPLICATE: 'payment.webhook.duplicate',
    WEBHOOK_FAILED: 'payment.webhook.failed',
    ADMIN_ROLE_CHANGED: 'admin.role_changed',
    ADMIN_USER_SUSPENDED: 'admin.user_suspended',
    ADMIN_USER_REACTIVATED: 'admin.user_reactivated',
    ADMIN_RECONCILIATION_REPAIR: 'admin.reconciliation_repair',
    ADMIN_PII_ACCESSED: 'admin.pii_accessed',
    LIMIT_EXCEEDED: 'wallet.limit_exceeded',
    BUDGET_CREATED: 'budget.created',
    BUDGET_UPDATED: 'budget.updated',
    BUDGET_ARCHIVED: 'budget.archived',
    BUDGET_ROLLED_OVER: 'budget.rolled_over',
    GOAL_CREATED: 'goal.created',
    GOAL_UPDATED: 'goal.updated',
    GOAL_ARCHIVED: 'goal.archived',
    GOAL_COMPLETED: 'goal.completed',
    GOAL_CONTRIBUTION_ADDED: 'goal.contribution.added',
    GOAL_CONTRIBUTION_REMOVED: 'goal.contribution.removed',
    ACCOUNT_CLOSED: 'user.account_closed',
    DATA_EXPORTED: 'user.data_exported',
    RECONCILIATION_ALERT: 'admin.reconciliation_alert',

    // ---- Phase 4: risk, recurring, bills, support, payees
    /** A transfer refused outright by the transaction risk engine (plan.md §30.2.2). */
    TRANSFER_BLOCKED: 'wallet.transfer.blocked',
    /** A transfer held pending review. No money moved. */
    TRANSFER_HELD: 'wallet.transfer.held',
    RISK_CASE_APPROVED: 'risk.case.approved',
    RISK_CASE_REJECTED: 'risk.case.rejected',
    /**
     * A held case released by the clock rather than by a person. Audited
     * distinctly from an approval on purpose: "nobody looked at this and we let
     * it through anyway" is a different fact about the control than "a reviewer
     * approved it", and an unstaffed queue should be visible in the audit trail.
     */
    RISK_CASE_AUTO_RELEASED: 'risk.case.auto_released',
    RECURRING_UPDATED: 'recurring.updated',
    RECURRING_DISMISSED: 'recurring.dismissed',
    BILL_CREATED: 'bill.created',
    BILL_UPDATED: 'bill.updated',
    BILL_DELETED: 'bill.deleted',
    BILL_MARKED_PAID: 'bill.marked_paid',
    SUPPORT_TICKET_CREATED: 'support.ticket.created',
    SUPPORT_TICKET_MESSAGE: 'support.ticket.message',
    SUPPORT_TICKET_CLOSED: 'support.ticket.closed',
    SUPPORT_TICKET_ASSIGNED: 'support.ticket.assigned',
    /** A fraud-category ticket, which auto-escalates and opens a risk case (§27.3). */
    SUPPORT_FRAUD_REPORTED: 'support.fraud_reported',
    PAYEE_SAVED: 'wallet.payee.saved',
    PAYEE_REMOVED: 'wallet.payee.removed',
    CATEGORY_RULE_CREATED: 'wallet.category_rule.created',
    CATEGORY_RULE_DELETED: 'wallet.category_rule.deleted',
    PAYMENT_CODE_ISSUED: 'wallet.payment_code.issued',

    // ---- Phase 4 remainder: overdraft, email verification, admin console
    /** A refund took a balance from >= 0 to below zero (plan.md §4.4). */
    WALLET_OVERDRAFT: 'wallet.overdraft',
    EMAIL_VERIFICATION_SENT: 'auth.email_verification.sent',
    EMAIL_VERIFIED: 'auth.email_verified',
    /** The paise backfill wrote to production rows (plan.md §7.4 step 2). */
    ADMIN_MINOR_BACKFILL: 'admin.minor_backfill',

    // ---- Console gaps (plan.md §28.2), 2026-09-14
    /** An operator credit or debit written as a `source: 'adjustment'` ledger row. */
    ADMIN_BALANCE_ADJUSTED: 'admin.balance_adjusted',
    /** Every session and push registration of another account revoked by staff. */
    ADMIN_FORCE_LOGOUT: 'admin.force_logout',
    ADMIN_WEBHOOK_REPLAYED: 'admin.webhook_replayed',
    ADMIN_PAYMENT_RESETTLED: 'admin.payment_resettled',

    // ---- Phase 4 close-out (2026-09-22): authenticator app, reset 2FA, escalation
    TOTP_SETUP_STARTED: 'security.totp.setup_started',
    TOTP_ENABLED: 'security.totp.enabled',
    TOTP_DISABLED: 'security.totp.disabled',
    TOTP_RECOVERY_CODES_REGENERATED: 'security.totp.recovery_codes_regenerated',
    TOTP_RECOVERY_CODE_USED: 'security.totp.recovery_code_used',
    /** Staff turned another account's authenticator off (the last step of recovery). */
    ADMIN_2FA_RESET: 'admin.2fa_reset',
    /** A staff request refused because the caller has no authenticator yet (§28.3 rule 5). */
    STAFF_TOTP_REQUIRED: 'admin.totp_enrolment_required',
    RISK_CASE_ESCALATED: 'risk.case.escalated',

    // ---- Phase 5 (2026-09-27): KYC, AML, withdrawals, bill payments, portfolio.
    // Metadata for every kyc.* / bank.* entry carries statuses, ids and masked
    // values only — never a PAN, an account number or document contents
    // (plan.md §0.20.2).
    KYC_SUBMITTED: 'kyc.submitted',
    KYC_DOCUMENT_UPLOADED: 'kyc.document_uploaded',
    KYC_DOCUMENT_REMOVED: 'kyc.document_removed',
    KYC_REVIEW_STARTED: 'kyc.review_started',
    KYC_REVIEW_RELEASED: 'kyc.review_released',
    KYC_VERIFIED: 'kyc.verified',
    KYC_REJECTED: 'kyc.rejected',
    KYC_ACTION_REQUIRED: 'kyc.action_required',
    /** Opening an identity or bank-proof document is a PII access (§28.3 rule 6). */
    KYC_DOCUMENT_VIEWED: 'kyc.document_viewed',
    AML_ALERT_RAISED: 'aml.alert.raised',
    AML_ALERT_CLOSED: 'aml.alert.closed',
    AML_WATCHLIST_IMPORTED: 'aml.watchlist.imported',
    BANK_ACCOUNT_ADDED: 'bank.account.added',
    BANK_ACCOUNT_REMOVED: 'bank.account.removed',
    BANK_ACCOUNT_VERIFIED: 'bank.account.verified',
    BANK_ACCOUNT_REJECTED: 'bank.account.rejected',
    /** The full account number was shown to staff (to send the money). */
    BANK_ACCOUNT_REVEALED: 'bank.account.revealed',
    WITHDRAWAL_REQUESTED: 'wallet.withdrawal.requested',
    WITHDRAWAL_CANCELLED: 'wallet.withdrawal.cancelled',
    WITHDRAWAL_APPROVED: 'wallet.withdrawal.approved',
    WITHDRAWAL_PAID: 'wallet.withdrawal.paid',
    WITHDRAWAL_REJECTED: 'wallet.withdrawal.rejected',
    WITHDRAWAL_FAILED: 'wallet.withdrawal.failed',
    WITHDRAWAL_STATEMENT_MATCHED: 'admin.withdrawal_statement_matched',
    BILL_PAYMENT_SUCCEEDED: 'bill.payment.succeeded',
    BILL_PAYMENT_FAILED: 'bill.payment.failed',
    HOLDING_SAVED: 'portfolio.holding.saved',
    HOLDING_REMOVED: 'portfolio.holding.removed',
    LIABILITY_SAVED: 'portfolio.liability.saved',
    LIABILITY_REMOVED: 'portfolio.liability.removed',
};

export default mongoose.model('AuditLog', auditLogSchema);
