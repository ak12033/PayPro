import api from '../index';

/**
 * Detected recurring payments (plan.md §18.3).
 *
 * Everything here describes a *detection*, not a subscription PayPro manages.
 * `dismiss` is the escape hatch the heuristic requires: a user must always be
 * able to say "that isn't recurring" and have it stay said.
 */
export const recurringApi = {
    list: (status = 'active') => api.get('/recurring', { params: { status } }),

    getUpcoming: (days = 30) => api.get('/recurring/upcoming', { params: { days } }),

    update: (id, payload) => api.patch(`/recurring/${id}`, payload),

    dismiss: (id) => api.delete(`/recurring/${id}`),

    /** Run detection now rather than waiting for tonight's pass. */
    detect: () => api.post('/recurring/detect'),
};

export default recurringApi;
