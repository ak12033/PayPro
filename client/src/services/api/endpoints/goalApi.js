import api from '../index';

export const goalApi = {
    list: (status) => api.get('/goals', { params: { ...(status && { status }) } }),

    create: (payload) => api.post('/goals', payload),

    get: (id) => api.get(`/goals/${id}`),

    update: (id, payload) => api.patch(`/goals/${id}`, payload),

    archive: (id) => api.delete(`/goals/${id}`),

    addContribution: (id, payload) => api.post(`/goals/${id}/contributions`, payload),

    removeContribution: (id, contributionId) => api.delete(`/goals/${id}/contributions/${contributionId}`),

    getProjection: (id) => api.get(`/goals/${id}/projection`),
};

export default goalApi;
