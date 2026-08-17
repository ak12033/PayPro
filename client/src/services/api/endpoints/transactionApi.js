import api from '../index';
import { RECENT_FETCH_LIMIT } from '../../../constants/transactions';

export const transactionApi = {
    /** Bounded server-side; an unbounded fetch used to hold the whole ledger in context. */
    getRecent: (limit = RECENT_FETCH_LIMIT) =>
        api.get('/transactions/recent', { params: { limit } }),

    /** Lifetime aggregates, computed by the server rather than reduced client-side. */
    getSummary: () => api.get('/transactions/summary'),

    getHistory: ({ page, limit, filter, search }) =>
        api.get('/transactions/history', {
            params: {
                page,
                limit,
                ...(filter && { filter }),
                ...(search && { search }),
            },
        }),

    add: (payload) => api.post('/transactions/add', payload),

    transfer: (payload) => api.post('/transactions/transfer', payload),

    verifyTransferOtp: ({ otp }) => api.post('/transactions/verify-otp', { otp }),

    /** No email in the body: the server resends for the caller's own challenge. */
    resendTransferOtp: () => api.post('/transactions/resend-otp'),

    /**
     * Fetched as a blob so the request carries the Authorization header — a bare
     * <a href> would hit the endpoint unauthenticated and download a 401 page.
     */
    exportCsv: ({ filter } = {}) =>
        api.get('/transactions/export', {
            responseType: 'blob',
            params: { ...(filter && { filter }) },
        }),

    /**
     * AI insights over the last 50 transactions.
     *
     * Rate limited server-side (`aiLimiter`) because every call costs money on
     * our Gemini key, which is why nothing in the UI fetches this on mount
     * without the user having asked to see it.
     */
    getInsights: () => api.get('/transactions/insights'),
};

export default transactionApi;
