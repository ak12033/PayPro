import api from '../index';

/** Self-reported holdings and debts (plan.md §21, §22). Moves no money. */
export const portfolioApi = {
    summary: () => api.get('/portfolio/summary'),
    holdings: () => api.get('/portfolio/holdings'),
    createHolding: (payload) => api.post('/portfolio/holdings', payload),
    updateHolding: (id, payload) => api.patch(`/portfolio/holdings/${id}`, payload),
    removeHolding: (id) => api.delete(`/portfolio/holdings/${id}`),
    liabilities: () => api.get('/portfolio/liabilities'),
    createLiability: (payload) => api.post('/portfolio/liabilities', payload),
    updateLiability: (id, payload) => api.patch(`/portfolio/liabilities/${id}`, payload),
    removeLiability: (id) => api.delete(`/portfolio/liabilities/${id}`),
};

export default portfolioApi;
