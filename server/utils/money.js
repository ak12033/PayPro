/**
 * Money helpers.
 *
 * The ledger's source of truth is integer paise (plan.md §7.4, step 3 of 3):
 * `Transaction.amountMinor` and `User.balanceMinor`. Every sum, comparison and
 * balance check reads those. The rupee fields (`amount`, `accountBalance`) are
 * still *written*, in lockstep, for one release as the rollback path — and
 * API responses still carry them, derived from the minor value, so older
 * clients keep working — but nothing does arithmetic on them any more.
 *
 * Why it matters: IEEE-754 doubles cannot represent most paise values
 * exactly. `0.3 - 0.1` is `0.19999999999999998`, so a balance of ₹0.30 that
 * had ₹0.10 spent from it could no longer pay ₹0.20 — the `$gte` guard said
 * no. Integers have no such failure mode below 2^53 paise.
 *
 * Input validation still happens in rupees (`parseAmount`), because that is
 * what users type; it rejects sub-paise precision, so every validated amount
 * converts to an exact integer.
 */

export const MAX_TXN_AMOUNT = 1000000; // ₹10,00,000 per single transaction
export const MAX_TXN_AMOUNT_MINOR = MAX_TXN_AMOUNT * 100;

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

/** Rupees -> integer paise. */
export const toPaise = (rupees) => Math.round(toMoney(rupees) * 100);

/** Integer paise -> rupees. */
export const fromPaise = (paise) => toMoney(Number(paise) / 100);

/** The names plan.md §7.4 uses; same functions. */
export const toMinor = toPaise;
export const fromMinor = fromPaise;

/**
 * A transaction's amount in paise.
 *
 * `amountMinor` is written on every row since Phase 2 and backfilled onto
 * older rows by `npm run backfill:minor`. The fallback covers a database the
 * backfill has not reached yet: an absent value is derived from `amount`, the
 * same `$round(amount * 100)` the backfill itself writes. A *present* value is
 * always trusted, because every writer sets it with `toPaise`.
 */
export const amountMinorOf = (tx) =>
    Number.isInteger(tx?.amountMinor) ? tx.amountMinor : toPaise(tx?.amount ?? 0);

/**
 * A user's balance in paise.
 *
 * No fallback is possible here the way there is for a transaction: a user who
 * predates Phase 2 has a `balanceMinor` that is *present but wrong* (`$inc` on
 * an absent field starts from 0), not absent. `npm run backfill:minor` fixes
 * it, and the server checks at boot (`minorBackfillService.assertMinorReadiness`)
 * so an un-backfilled database is reported loudly rather than discovered as
 * refused payments.
 */
export const balanceMinorOf = (user) => (Number.isInteger(user?.balanceMinor) ? user.balanceMinor : 0);

/** A user's balance in rupees, derived from the integer column. */
export const balanceOf = (user) => fromPaise(balanceMinorOf(user));

/**
 * The balance fields every wallet-changing response and `wallet_update` event
 * carries: the integer value the client should render, plus the rupee value
 * for clients that predate it.
 */
export const newBalanceFields = (user) => ({
    newBalance: balanceOf(user),
    newBalanceMinor: balanceMinorOf(user),
});

/**
 * The aggregation-pipeline form of `amountMinorOf`, for `$sum`/`$group`
 * stages. Every ledger aggregation sums this, never `'$amount'`.
 */
export const AMOUNT_MINOR_EXPR = {
    $ifNull: ['$amountMinor', { $round: [{ $multiply: ['$amount', 100] }, 0] }],
};
