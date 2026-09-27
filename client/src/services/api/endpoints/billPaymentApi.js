import api from '../index';
import { createIdempotencyKey } from '../../../lib/idempotency';

/**
 * Paying a bill through a provider (plan.md §19.3). Separate from `billApi`,
 * which is reminders only and has no way to pay anything. Today the only
 * provider is a demo one, and only outside production.
 */
export const billPaymentApi = {
    status: () => api.get('/bill-payments/status'),
    billers: () => api.get('/bill-payments/billers'),
    fetch: ({ billerId, customerRef }) => api.post('/bill-payments/fetch', { billerId, customerRef }),
    pay: ({ billerId, customerRef, billId, idempotencyKey = createIdempotencyKey() }) =>
        api.post('/bill-payments/pay', { billerId, customerRef, billId }, { headers: { 'Idempotency-Key': idempotencyKey } }),
};

export default billPaymentApi;
