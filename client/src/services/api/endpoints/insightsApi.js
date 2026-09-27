import api from '../index';

/** Persisted deterministic insights (plan.md §24.3) — distinct from `aiApi.getInsights`'s on-demand Gemini analysis. */
export const insightsApi = {
    list: (status = 'active') => api.get('/insights', { params: { status } }),

    dismiss: (id) => api.patch(`/insights/${id}/dismiss`),
};

export default insightsApi;
