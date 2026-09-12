import api from '../index';

export const analyticsApi = {
    getOverview: (range) => api.get('/analytics/overview', { params: { range } }),

    getCategories: (range) => api.get('/analytics/categories', { params: { range } }),

    getNetwork: (range) => api.get('/analytics/network', { params: { range } }),

    getPaymentsStatus: (range) => api.get('/analytics/payments-status', { params: { range } }),
};

export default analyticsApi;
