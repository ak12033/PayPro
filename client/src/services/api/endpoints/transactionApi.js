import api from '../index';
import { RECENT_FETCH_LIMIT } from '../../../constants/transactions';

export const transactionApi = {
    /** Bounded server-side; an unbounded fetch used to hold the whole ledger in context. */
    getRecent: (limit = RECENT_FETCH_LIMIT) =>
        api.get('/transactions/recent', { params: { limit } }),

    /** Lifetime aggregates, computed by the server rather than reduced client-side. */
    getSummary: () => api.get('/transactions/summary'),

    getHistory: ({ page, limit, filter, search, category, startDate, sortOrder }) =>
        api.get('/transactions/history', {
            params: {
                page,
                limit,
                ...(filter && { filter }),
                ...(search && { search }),
                ...(category && { category }),
                ...(startDate && { startDate }),
                ...(sortOrder && { sortOrder }),
            },
        }),

    /**
     * The last few people the user sent money to, most recent first.
     *
     * Distinct from `/analytics/network`'s `topRecipients`, which ranks by
     * total volume — that answers a different question and makes a poor
     * "send again" shortcut.
     */
    getRecentRecipients: () => api.get('/transactions/recent-recipients'),

    /** The canonical category list — one source of truth shared with the AI categoriser. */
    getCategories: () => api.get('/transactions/categories'),

    /** Corrects a transaction the AI (or the user, earlier) miscategorised. */
    /**
     * `alwaysCategorise` opts into a standing rule for this merchant
     * (plan.md §12.4). Off by default: correcting one transaction is not the
     * same as making a standing decision, so the UI asks first.
     */
    updateCategory: (id, category, { alwaysCategorise = false } = {}) =>
        api.patch(`/transactions/${id}/category`, { category, alwaysCategorise }),

    getCategoryRules: () => api.get('/transactions/category-rules'),

    deleteCategoryRule: (id) => api.delete(`/transactions/category-rules/${id}`),

    add: (payload) => api.post('/transactions/add', payload),

    transfer: (payload) => api.post('/transactions/transfer', payload),

    verifyTransferOtp: ({ otp }) => api.post('/transactions/verify-otp', { otp }),

    /** No email in the body: the server resends for the caller's own challenge. */
    resendTransferOtp: () => api.post('/transactions/resend-otp'),

    /**
     * Fetched as a blob so the request carries the Authorization header — a bare
     * <a href> would hit the endpoint unauthenticated and download a 401 page.
     *
     * Takes the same shape of params as `getHistory` so an export always
     * matches what's currently on screen rather than the whole ledger.
     */
    exportCsv: ({ filter, category, search, startDate } = {}) =>
        api.get('/transactions/export', {
            responseType: 'blob',
            params: {
                ...(filter && { filter }),
                ...(category && { category }),
                ...(search && { search }),
                ...(startDate && { startDate }),
            },
        }),

    /** A single calendar month, in a format meant to be handed to someone else — distinct from `exportCsv` above. */
    getStatement: ({ month, format = 'csv' } = {}) =>
        api.get('/transactions/statement', {
            responseType: 'blob',
            params: { ...(month && { month }), format },
        }),
};

export default transactionApi;
