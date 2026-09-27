import api from '../index';

/**
 * Saved payees and QR payment codes (plan.md §10.2.7, §9.3).
 *
 * Saving a payee is an address-book entry, not a standing authorisation: it
 * skips no 2FA and exempts nothing from the risk gate.
 */
export const payeeApi = {
    list: () => api.get('/payees'),

    save: (payload) => api.post('/payees', payload),

    update: (id, payload) => api.patch(`/payees/${id}`, payload),

    remove: (id) => api.delete(`/payees/${id}`),

    /** A short-lived signed code the client renders as a QR. */
    getPaymentCode: () => api.get('/payees/payment-code'),

    /** Resolves a scanned code to a recipient. Authorises nothing. */
    resolvePaymentCode: (code) => api.post('/payees/payment-code/resolve', { code }),
};

export default payeeApi;
