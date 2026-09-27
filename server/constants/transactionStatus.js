/**
 * Transaction lifecycle.
 *
 * Every ledger row used to be implicitly terminal — there was no way to
 * represent a top-up waiting on Razorpay, a transfer that failed mid-flight,
 * or a reversed payment. Only SUCCESS rows (settled: 'settled') ever move
 * `User.accountBalance` or count toward a budget/analytics total; everything
 * else is visible in Activity but excluded from money math.
 */
export const TX_STATUS = {
    PENDING: 'PENDING',
    PROCESSING: 'PROCESSING',
    SUCCESS: 'SUCCESS',
    FAILED: 'FAILED',
    CANCELLED: 'CANCELLED',
    REFUNDED: 'REFUNDED',
    PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
};

export const TX_STATUSES = Object.values(TX_STATUS);

/** Statuses that participate in the balance invariant when settlement !== 'none'. */
export const SETTLED_STATUSES = [TX_STATUS.SUCCESS, TX_STATUS.PARTIALLY_REFUNDED];

/**
 * Statuses whose rows are part of `accountBalance`'s arithmetic — the set the
 * balance invariant (plan.md §7.5) must sum over.
 *
 * This is SETTLED_STATUSES **plus REFUNDED**, and the difference is not
 * cosmetic. A refund never mutates the original row's amount: it writes a
 * separate reversal Debit and relabels the original top-up REFUNDED
 * (`ledgerService.debitForRefund`). The original credit really did move the
 * balance, and the reversal really did move it back, so both must be summed.
 * Reconciling over SETTLED_STATUSES alone dropped the credit but kept the
 * reversal, reporting every refunded account as drifted by the refund amount —
 * and `repairAccountBalance` would then have "corrected" that account into a
 * negative balance. Use SETTLED_STATUSES for "what counts as activity"
 * (analytics, limits) and this for "what the balance is made of".
 */
export const BALANCE_STATUSES = [...SETTLED_STATUSES, TX_STATUS.REFUNDED];

/** Once a row reaches one of these it never transitions again. */
export const TERMINAL_STATUSES = [
    TX_STATUS.FAILED,
    TX_STATUS.CANCELLED,
    TX_STATUS.REFUNDED,
];

/**
 * Legal next-states for every status. Anything not listed here is refused by
 * `assertTransition` in transactionStateService.js.
 */
export const ALLOWED_TRANSITIONS = {
    [TX_STATUS.PENDING]: [TX_STATUS.PROCESSING, TX_STATUS.SUCCESS, TX_STATUS.FAILED, TX_STATUS.CANCELLED],
    [TX_STATUS.PROCESSING]: [TX_STATUS.SUCCESS, TX_STATUS.FAILED],
    [TX_STATUS.SUCCESS]: [TX_STATUS.REFUNDED, TX_STATUS.PARTIALLY_REFUNDED],
    [TX_STATUS.PARTIALLY_REFUNDED]: [TX_STATUS.REFUNDED, TX_STATUS.PARTIALLY_REFUNDED],
    [TX_STATUS.FAILED]: [],
    [TX_STATUS.CANCELLED]: [],
    [TX_STATUS.REFUNDED]: [],
};

export const TX_SOURCE = {
    P2P: 'p2p',
    TOPUP: 'topup',
    REFUND: 'refund',
    MANUAL: 'manual',
    BILL: 'bill',
    MERCHANT: 'merchant',
    ADJUSTMENT: 'adjustment',
    /** Money leaving the wallet to the holder's own bank account (plan.md §0.20.3). */
    WITHDRAWAL: 'withdrawal',
};

export const TX_SOURCES = Object.values(TX_SOURCE);

/**
 * Holds (Phase 5).
 *
 * A withdrawal or a bill payment takes the money out of the wallet the moment
 * it is requested — the `debitWallet` guard runs then, so the same rupee cannot
 * be withdrawn twice or spent while a withdrawal waits for review — but the
 * payment itself completes later (an operator's bank transfer, a biller's
 * confirmation). Until then the row is PENDING or PROCESSING, and **the
 * balance has already moved**.
 *
 * Such a row therefore belongs in the balance sum even though it is not yet
 * SUCCESS. If it fails or is rejected, `ledgerService.releaseHold` credits the
 * wallet back and moves the row to FAILED/CANCELLED in one transaction — at
 * which point it leaves the sum, exactly as its money leaves the hold.
 *
 * Only these sources can hold. A PENDING *top-up* moved nothing and must stay
 * out of the sum; that is why this is keyed on source and not on status alone.
 */
export const HOLD_SOURCES = [TX_SOURCE.WITHDRAWAL, TX_SOURCE.BILL];
export const HOLD_STATUSES = [TX_STATUS.PENDING, TX_STATUS.PROCESSING];

export const TX_SETTLEMENT = {
    SETTLED: 'settled',
    NONE: 'none',
};

export const TX_SETTLEMENTS = Object.values(TX_SETTLEMENT);

/**
 * "What the balance is made of" — the one filter reconciliation, repair and the
 * paise verification report must use (context.md §5.7). BALANCE_STATUSES, plus
 * money currently held by a pending withdrawal or bill payment.
 */
export const BALANCE_MATCH = {
    settlement: TX_SETTLEMENT.SETTLED,
    $or: [
        { status: { $in: BALANCE_STATUSES } },
        { source: { $in: HOLD_SOURCES }, status: { $in: HOLD_STATUSES } },
    ],
};
