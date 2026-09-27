import api from '../index';

export const budgetApi = {
    get: (period) => api.get('/budgets', { params: { ...(period && { period }) } }),

    create: (payload) => api.post('/budgets', payload),

    update: (id, payload) => api.patch(`/budgets/${id}`, payload),

    archive: (id) => api.delete(`/budgets/${id}`),

    getHistory: () => api.get('/budgets/history'),

    getSuggestions: () => api.get('/budgets/suggestions'),

    rollover: (id) => api.post(`/budgets/${id}/rollover`),
};

export default budgetApi;
