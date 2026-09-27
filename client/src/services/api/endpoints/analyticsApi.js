import api from '../index';

export const analyticsApi = {
    getOverview: (range) => api.get('/analytics/overview', { params: { range } }),

    getCategories: (range) => api.get('/analytics/categories', { params: { range } }),

    getNetwork: (range) => api.get('/analytics/network', { params: { range } }),

    getPaymentsStatus: (range) => api.get('/analytics/payments-status', { params: { range } }),

    getCashflow: (range) => api.get('/analytics/cashflow', { params: { range } }),

    getMerchants: (range, limit) => api.get('/analytics/merchants', { params: { range, limit } }),

    getTopExpenses: (range, limit) => api.get('/analytics/top-expenses', { params: { range, limit } }),

    /**
     * Financial health (plan.md §25). The response carries its own
     * `disclaimer` — render it beside the score, never in a tooltip.
     */
    getFinancialHealth: () => api.get('/analytics/financial-health'),

    /** Weekday × hour spending grid (plan.md §17.2). Dense 7 × 24, Monday first. */
    getSpendingRhythm: (range) => api.get('/analytics/spending-rhythm', { params: { range } }),
};

export default analyticsApi;
