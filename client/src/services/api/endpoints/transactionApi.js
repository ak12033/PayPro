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
};

export default transactionApi;
