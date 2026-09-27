import api from '../index';
import { createIdempotencyKey } from '../../../lib/idempotency';

/**
 * Withdrawals to the holder's own bank account (plan.md §0.20.3). Money leaves
 * only after a person at PayPro sends it; `request` holds it from the balance
 * until then.
 */
export const withdrawalApi = {
    list: () => api.get('/withdrawals'),
    /** A money route: one idempotency key per confirmation, like a transfer. */
    request: ({ bankAccountId, amount, idempotencyKey = createIdempotencyKey() }) =>
        api.post('/withdrawals', { bankAccountId, amount }, { headers: { 'Idempotency-Key': idempotencyKey } }),
    cancel: (id) => api.post(`/withdrawals/${id}/cancel`),

    listBankAccounts: () => api.get('/withdrawals/bank-accounts'),
    addBankAccount: (details) => api.post('/withdrawals/bank-accounts', details),
    removeBankAccount: (id) => api.delete(`/withdrawals/bank-accounts/${id}`),
    uploadBankDocument: (id, { type, file }) =>
        api.post(`/withdrawals/bank-accounts/${id}/documents`, file, {
            params: { type },
            headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
        }),
};

export default withdrawalApi;
