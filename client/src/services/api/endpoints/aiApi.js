import api from '../index';

export const aiApi = {
    getHistory: () => api.get('/ai/history'),

    /** `path` gives the assistant page-awareness for the current screen. */
    sendMessage: ({ query, path }) => api.post('/ai/chat', { query, path }),

    clearHistory: () => api.delete('/ai/history'),
};

export default aiApi;
