import api from '../index';

export const supportApi = {
    /** Public — someone locked out still needs to read the help (plan.md §27.2). */
    getFaq: () => api.get('/support/faq'),

    listTickets: (status) => api.get('/support/tickets', { params: { ...(status && { status }) } }),

    createTicket: (payload) => api.post('/support/tickets', payload),

    getTicket: (id) => api.get(`/support/tickets/${id}`),

    addMessage: (id, body) => api.post(`/support/tickets/${id}/messages`, { body }),

    close: (id) => api.post(`/support/tickets/${id}/close`),
};

export default supportApi;
