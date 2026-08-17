/**
 * Money helpers.
 *
 * Balances are stored in this project as rupees (Number). We deliberately do NOT
 * migrate to integer paise here because that would require a data migration of
 * every existing User.accountBalance and Transaction.amount document.
 *
 * Instead we defend against IEEE-754 drift at the boundaries:
 *   - every amount entering the system is validated to be a finite, positive
 *     number with at most 2 decimal places
 *   - every arithmetic result that gets persisted is rounded to 2 dp
 *   - Razorpay conversions go through Math.round so we never send a fractional
 *     paise value (which the gateway rejects)
 */

export const MAX_TXN_AMOUNT = 1000000; // ₹10,00,000 per single transaction

/**
 * Round to 2 decimal places without the classic `Math.round(x*100)/100`
 * drift on values like 1.005.
 */
export const toMoney = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Number(n.toFixed(2));
};

/**
 * Parse + validate a user supplied amount.
 * Returns { ok: true, value } or { ok: false, error }.
 *
 * Rejects: NaN, Infinity, negatives, zero, >2dp, above MAX_TXN_AMOUNT, and
 * non-primitive input (guards against `{ "$gt": 0 }` style NoSQL payloads).
 */
export const parseAmount = (raw) => {
    if (raw === null || raw === undefined || raw === '') {
        return { ok: false, error: 'Amount is required' };
    }
    if (typeof raw === 'object') {
        return { ok: false, error: 'Amount must be a number' };
    }

    const n = Number(raw);

    if (!Number.isFinite(n)) {
        return { ok: false, error: 'Amount must be a valid number' };
    }
    if (n <= 0) {
        return { ok: false, error: 'Amount must be greater than zero' };
    }
    if (n > MAX_TXN_AMOUNT) {
        return { ok: false, error: `Amount may not exceed ₹${MAX_TXN_AMOUNT.toLocaleString('en-IN')}` };
    }
    // Reject sub-paise precision (e.g. 10.999) so the ledger stays exact.
    if (Number(n.toFixed(2)) !== n) {
        return { ok: false, error: 'Amount may have at most 2 decimal places' };
    }

    return { ok: true, value: toMoney(n) };
};

/** Rupees -> integer paise, for Razorpay. */
export const toPaise = (rupees) => Math.round(toMoney(rupees) * 100);

/** Integer paise -> rupees. */
export const fromPaise = (paise) => toMoney(Number(paise) / 100);
