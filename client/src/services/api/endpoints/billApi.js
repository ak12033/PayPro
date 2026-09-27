import api from '../index';

/**
 * Bill reminders (plan.md §19.2).
 *
 * There is no `pay` method here and there must never be one: PayPro has no
 * payout rail and no BBPS connectivity (§19.1). `markPaid` records that money
 * moved somewhere else.
 */
export const billApi = {
    list: (status) => api.get('/bills', { params: { ...(status && { status }) } }),

    create: (payload) => api.post('/bills', payload),

    update: (id, payload) => api.patch(`/bills/${id}`, payload),

    remove: (id) => api.delete(`/bills/${id}`),

    markPaid: (id, payload = {}) => api.post(`/bills/${id}/mark-paid`, payload),

    seedFromRecurring: () => api.post('/bills/seed-from-recurring'),
};

export default billApi;
