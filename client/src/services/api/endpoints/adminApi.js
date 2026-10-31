import api from '../index';
import { createIdempotencyKey } from '../../../lib/idempotency';

/**
 * `/api/admin/*` (plan.md §28). Every call here is role-gated server-side;
 * the console only decides which of them to offer.
 *
 * Destructive calls take `currentPassword` — re-authentication is part of the
 * API contract for suspend, reactivate and role changes (§28.3 rule 4), not a
 * client nicety.
 */
const clean = (params) => Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
);

export const adminApi = {
    getMetrics: () => api.get('/admin/metrics'),

    listUsers: ({ search, page } = {}) => api.get('/admin/users', { params: clean({ search, page }) }),
    setRole: (userId, { role, currentPassword }) =>
        api.patch(`/admin/users/${userId}/role`, { role, currentPassword }),
    suspend: (userId, { currentPassword }) => api.post(`/admin/users/${userId}/suspend`, { currentPassword }),
    reactivate: (userId, { currentPassword }) => api.post(`/admin/users/${userId}/reactivate`, { currentPassword }),

    getReconciliation: ({ userId } = {}) => api.get('/admin/reconciliation/report', { params: clean({ userId }) }),
    repair: (userId, { reason }) => api.post(`/admin/reconciliation/repair/${userId}`, { reason }),
    getMinorVerification: () => api.get('/admin/reconciliation/minor'),

    listWebhooks: ({ status, page } = {}) => api.get('/admin/webhooks', { params: clean({ status, page }) }),

    listRiskCases: ({ status, page } = {}) => api.get('/admin/risk/cases', { params: clean({ status, page }) }),
    getRiskCase: (id) => api.get(`/admin/risk/cases/${id}`),
    decideRiskCase: (id, { decision, notes }) => api.post(`/admin/risk/cases/${id}/decision`, { decision, notes }),
    /** Hand a case to an admin. Once escalated, only an admin can decide it. */
    escalateRiskCase: (id, { reason }) => api.post(`/admin/risk/cases/${id}/escalate`, { reason }),

    listTickets: ({ status } = {}) => api.get('/admin/support/tickets', { params: clean({ status }) }),
    getTicket: (id) => api.get(`/admin/support/tickets/${id}`),
    replyTicket: (id, body) => api.post(`/admin/support/tickets/${id}/messages`, { body }),
    assignTicket: (id) => api.post(`/admin/support/tickets/${id}/assign`),
    resolveTicket: (id) => api.post(`/admin/support/tickets/${id}/resolve`),

    /** `from`/`to` are `YYYY-MM-DD` IST days; `to` is inclusive. */
    listAuditLogs: ({ userId, action, outcome, from, to, page } = {}) =>
        api.get('/admin/audit-logs', { params: clean({ userId, action, outcome, from, to, page }) }),

    getUser: (userId) => api.get(`/admin/users/${userId}`),
    forceLogout: (userId, { currentPassword }) => api.post(`/admin/users/${userId}/logout-all`, { currentPassword }),
    /** The last step of authenticator recovery. `reason` records how the holder was verified. */
    resetTwoFactor: (userId, { currentPassword, reason }) =>
        api.post(`/admin/users/${userId}/reset-2fa`, { currentPassword, reason }),

    searchTransactions: (filters = {}) => api.get('/admin/transactions', { params: clean(filters) }),
    getTransaction: (id) => api.get(`/admin/transactions/${id}`),

    listPayments: ({ status, stuck, orderId, userId, page } = {}) =>
        api.get('/admin/payments', { params: clean({ status, stuck: stuck ? 'true' : undefined, orderId, userId, page }) }),
    resettlePayment: (orderId) => api.post(`/admin/payments/${encodeURIComponent(orderId)}/resettle`),
    /** Refund a top-up to its card (DEF-01). Keyed per confirmation, like `adjustBalance` below. */
    refundPayment: (orderId, { reason, currentPassword, idempotencyKey = createIdempotencyKey() }) =>
        api.post(`/admin/payments/${encodeURIComponent(orderId)}/refund`, { reason, currentPassword }, {
            headers: { 'Idempotency-Key': idempotencyKey },
        }),

    replayWebhook: (id) => api.post(`/admin/webhooks/${id}/replay`),

    /**
     * A money route like any other: it carries an idempotency key. The caller
     * creates one per *confirmation*, so a double-tap replays but a corrected
     * retry (say, after a mistyped password) is a new request.
     */
    adjustBalance: ({ userId, type, amount, reason, currentPassword, idempotencyKey = createIdempotencyKey() }) =>
        api.post('/admin/adjustments', { userId, type, amount, reason, currentPassword }, {
            headers: { 'Idempotency-Key': idempotencyKey },
        }),

    // ---- Phase 5 (plan.md §0.20)

    listKyc: ({ status, page } = {}) => api.get('/admin/kyc', { params: clean({ status, page }) }),
    getKyc: (id) => api.get(`/admin/kyc/${id}`),
    claimKyc: (id) => api.post(`/admin/kyc/${id}/claim`),
    releaseKyc: (id, { reason } = {}) => api.post(`/admin/kyc/${id}/release`, { reason }),
    /** `{ status, method, reference, notes, userVisibleReason, requestedActions, tier, currentPassword }` */
    decideKyc: (id, decision) => api.post(`/admin/kyc/${id}/decision`, decision),
    revokeKyc: (id, body) => api.post(`/admin/kyc/${id}/revoke`, body),
    /** The file itself, as a Blob. Every call is audited server-side. */
    getKycDocument: (id, documentId) => api.get(`/admin/kyc/${id}/documents/${documentId}`, { responseType: 'blob' }),
    revealPan: (id) => api.get(`/admin/kyc/${id}/pan`),

    listAmlAlerts: ({ status, rule, page } = {}) => api.get('/admin/aml/alerts', { params: clean({ status, rule, page }) }),
    getAmlAlert: (id) => api.get(`/admin/aml/alerts/${id}`),
    closeAmlAlert: (id, { disposition, notes, reportDraft }) => api.post(`/admin/aml/alerts/${id}/close`, { disposition, notes, reportDraft }),
    listWatchlists: () => api.get('/admin/aml/watchlists'),
    /** The CSV is the body; name and source ride in the query string. */
    importWatchlist: ({ name, source, csv }) =>
        api.post('/admin/aml/watchlists', csv, { params: { name, source }, headers: { 'Content-Type': 'text/csv' } }),

    listBankAccounts: ({ status, page } = {}) => api.get('/admin/bank-accounts', { params: clean({ status, page }) }),
    getBankAccount: (id) => api.get(`/admin/bank-accounts/${id}`),
    revealBankAccountNumber: (id) => api.get(`/admin/bank-accounts/${id}/account-number`),
    getBankDocument: (id, documentId) => api.get(`/admin/bank-accounts/${id}/documents/${documentId}`, { responseType: 'blob' }),
    decideBankAccount: (id, { decision, notes, userVisibleReason, currentPassword }) =>
        api.post(`/admin/bank-accounts/${id}/decision`, { decision, notes, userVisibleReason, currentPassword }),

    listWithdrawals: ({ status, page } = {}) => api.get('/admin/withdrawals', { params: clean({ status, page }) }),
    getWithdrawal: (id) => api.get(`/admin/withdrawals/${id}`),
    revealWithdrawalDestination: (id) => api.get(`/admin/withdrawals/${id}/destination`),
    approveWithdrawal: (id, { currentPassword }) => api.post(`/admin/withdrawals/${id}/approve`, { currentPassword }),
    markWithdrawalPaid: (id, { reference, currentPassword }) => api.post(`/admin/withdrawals/${id}/paid`, { reference, currentPassword }),
    rejectWithdrawal: (id, { userVisibleReason, notes }) => api.post(`/admin/withdrawals/${id}/reject`, { userVisibleReason, notes }),
    failWithdrawal: (id, { userVisibleReason, notes, currentPassword }) =>
        api.post(`/admin/withdrawals/${id}/fail`, { userVisibleReason, notes, currentPassword }),
    matchStatement: (csv) => api.post('/admin/withdrawals/statement', csv, { headers: { 'Content-Type': 'text/csv' } }),
};

export default adminApi;
