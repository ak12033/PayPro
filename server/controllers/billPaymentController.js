import { asyncHandler } from '../utils/asyncHandler.js';
import { asObjectId, asString } from '../utils/sanitize.js';
import { DomainError } from '../utils/domainError.js';
import { getStatus, searchBillers, fetchBill, payBill } from '../services/billPaymentService.js';

/**
 * Paying a bill through the provider adapter (plan.md §19.3). With no provider
 * configured every route but `/status` answers 503 — see providers/billProvider.js.
 */

const billInput = (body = {}) => {
    const billerId = asString(body.billerId, { maxLength: 60 });
    const customerRef = asString(body.customerRef, { maxLength: 40 })?.toUpperCase();
    if (!billerId || !customerRef) throw new DomainError('INVALID_INPUT', 'Choose a biller and enter your account reference', 400);
    return { billerId, customerRef };
};

export const getBillPaymentStatus = asyncHandler(async (req, res) => {
    res.status(200).json(getStatus());
});

export const getBillers = asyncHandler(async (req, res) => {
    res.status(200).json({ billers: await searchBillers(), ...getStatus() });
});

export const postFetchBill = asyncHandler(async (req, res) => {
    res.status(200).json({ bill: await fetchBill(billInput(req.body)), ...getStatus() });
});

export const postPayBill = asyncHandler(async (req, res) => {
    const billId = req.body?.billId ? asObjectId(req.body.billId) : null;
    if (req.body?.billId && !billId) throw new DomainError('INVALID_ID', 'A valid bill reminder id is required', 400);

    const result = await payBill(req.user.id, {
        ...billInput(req.body),
        billId,
        idempotencyKey: asString(req.get('idempotency-key'), { maxLength: 100 }),
    }, { req });

    // A declined payment is a completed request whose answer is "no": 200 with
    // status FAILED, and the money already back in the wallet.
    res.status(result.status === 'SUCCESS' ? 201 : 200).json(result);
});
