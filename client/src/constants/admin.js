/**
 * The operations console's vocabulary (plan.md §28).
 *
 * `CAPABILITIES` mirrors `server/routes/adminRoutes.js`'s `requireRole(...)`
 * calls, one entry per thing a screen can show or do. It exists so the client
 * can *hide* what a role cannot use — a support agent should not see a
 * "Repair balance" button that would only ever 403. It is presentation, not
 * authorisation: every one of these is enforced again server-side on every
 * request, and `constants/admin.test.js` pins this table to the server's.
 *
 * Separation of duties (§28.3) is visible in the table itself: support reads
 * and replies but never touches money or roles; risk holds and releases but
 * never changes roles; only admin changes roles or repairs a balance.
 */

export const STAFF_ROLES = ['support', 'risk', 'admin'];

export const isStaff = (role) => STAFF_ROLES.includes(role);

export const CAPABILITIES = {
    viewMetrics: ['admin', 'support', 'risk'],
    viewUsers: ['admin', 'support', 'risk'],
    suspendUsers: ['admin', 'risk'],
    changeRoles: ['admin'],
    viewReconciliation: ['admin', 'risk'],
    repairBalances: ['admin'],
    viewWebhooks: ['admin', 'support'],
    reviewRisk: ['admin', 'risk'],
    workSupport: ['admin', 'support'],
    viewAuditLog: ['admin', 'risk'],
    // Console gaps closed 2026-09-14 (plan.md §28.2).
    viewUserDetail: ['admin', 'support', 'risk'],
    forceLogout: ['admin', 'risk'],
    searchTransactions: ['admin', 'support', 'risk'],
    viewPayments: ['admin', 'support', 'risk'],
    resettlePayments: ['admin'],
    // DEF-01: refunds are a staff decision; the customer route is gone.
    refundPayments: ['admin'],
    replayWebhooks: ['admin'],
    adjustBalances: ['admin'],
    // Phase 4 close-out, 2026-09-22.
    resetTwoFactor: ['admin'],
    escalateRisk: ['admin', 'risk'],
    // Phase 5, 2026-09-27 (plan.md §0.20). Identity decisions and anything that
    // lets money leave are admin only; AML alerts are also risk's work.
    reviewKyc: ['admin'],
    viewAml: ['admin', 'risk'],
    closeAml: ['admin', 'risk'],
    importWatchlists: ['admin'],
    reviewBankAccounts: ['admin'],
    processWithdrawals: ['admin'],
};

export const can = (role, capability) => Boolean(CAPABILITIES[capability]?.includes(role));

export const ROLE_LABEL = {
    user: 'Customer',
    support: 'Support',
    risk: 'Risk',
    admin: 'Admin',
};

export const ACCOUNT_STATUS_TONE = {
    active: 'positive',
    suspended: 'warning',
    closed: 'neutral',
};

export const RISK_STATUS_LABEL = {
    open: 'Awaiting review',
    approved: 'Approved',
    rejected: 'Rejected',
    auto_released: 'Auto-released',
};

/**
 * `auto_released` is deliberately a warning, not a success: it means the
 * deadline passed with nobody looking (plan.md §30.2.3). Rendering it green
 * would make an unstaffed queue look like a well-run one.
 */
export const RISK_STATUS_TONE = {
    open: 'info',
    approved: 'positive',
    rejected: 'negative',
    auto_released: 'warning',
};

export const RISK_ACTION_LABEL = {
    hold: 'Held',
    block: 'Blocked',
};

export const WEBHOOK_STATUS_TONE = {
    received: 'info',
    processed: 'positive',
    failed: 'negative',
    ignored: 'neutral',
};

export const PAYMENT_STATUS_TONE = {
    created: 'info',
    captured: 'positive',
    failed: 'negative',
    refunded: 'neutral',
};

/** How each ledger row was produced — the admin transaction search's source filter. */
export const TX_SOURCE_LABEL = {
    p2p: 'Transfer',
    topup: 'Top-up',
    refund: 'Refund',
    manual: 'Manual note',
    bill: 'Bill',
    merchant: 'Merchant',
    adjustment: 'Adjustment',
    withdrawal: 'Withdrawal',
};

/** Agent-side ticket labels. The user-side ones in constants/support.js speak to the customer. */
export const AGENT_TICKET_STATUS_LABEL = {
    open: 'New',
    awaiting_user: 'Waiting on customer',
    in_progress: 'In progress',
    resolved: 'Resolved',
    closed: 'Closed by customer',
};

export const AML_RULE_LABEL = {
    STRUCTURING: 'Structuring',
    RAPID_IN_OUT: 'Rapid in and out',
    FAN_IN: 'Many senders',
    FAN_OUT: 'Many recipients',
    HIGH_VELOCITY: 'High velocity',
    WATCHLIST_MATCH: 'Watchlist match',
    SHARED_IDENTIFIER: 'Shared identifier',
};

export const AML_SEVERITY_TONE = { high: 'negative', medium: 'warning', low: 'neutral' };

export const AML_DISPOSITION_LABEL = {
    false_positive: 'False positive',
    no_action: 'Reviewed, no action',
    suspicious: 'Suspicious (report drafted)',
};

export const BANK_ACCOUNT_STATUS_TONE = { pending: 'info', verified: 'positive', rejected: 'negative', removed: 'neutral' };

/** Namespaces from server/models/AuditLog.js, for the audit-log filter. */
export const AUDIT_NAMESPACES = [
    { value: '', label: 'All actions' },
    { value: 'auth.', label: 'Sign-in & sessions' },
    { value: 'security.', label: 'Devices & risk flags' },
    { value: 'wallet.', label: 'Wallet' },
    { value: 'payment.', label: 'Payments & webhooks' },
    { value: 'risk.', label: 'Risk decisions' },
    { value: 'support.', label: 'Support' },
    { value: 'admin.', label: 'Admin actions' },
    { value: 'user.', label: 'Profile & account' },
    { value: 'kyc.', label: 'Identity verification' },
    { value: 'aml.', label: 'AML monitoring' },
    { value: 'bank.', label: 'Bank accounts' },
    { value: 'portfolio.', label: 'Portfolio tracker' },
];
