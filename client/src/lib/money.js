/**
 * Integer-paise helpers (plan.md §7.4 step 3).
 *
 * The server's ledger is integer paise: every transaction carries
 * `amountMinor`, every balance response carries `balanceMinor` /
 * `newBalanceMinor`. The rupee fields are still sent for one release, so each
 * reader here prefers the minor value and falls back to the rupee one — the
 * "tolerate both shapes" rule from plan.md §45.3.
 */

/** Rupees -> integer paise. Rounds, because `19.99 * 100` is `1998.999…`. */
export const toMinor = (rupees) => {
    const n = Number(rupees);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

/** Integer paise -> rupees, for arithmetic that still happens in rupees (form inputs). */
export const fromMinor = (minor) => {
    const n = Number(minor);
    return Number.isFinite(n) ? n / 100 : 0;
};

const minorOr = (minor, rupees) => (Number.isInteger(minor) ? minor : toMinor(rupees));

/** A transaction's amount in paise. */
export const amountMinorOf = (tx) => minorOr(tx?.amountMinor, tx?.amount);

/** A user/profile object's balance in paise. */
export const balanceMinorOf = (user) => minorOr(user?.balanceMinor, user?.accountBalance);

/** The balance a `wallet_update`-style payload carries, in paise, or null if it carries none. */
export const newBalanceMinorOf = (payload) => {
    if (Number.isInteger(payload?.newBalanceMinor)) return payload.newBalanceMinor;
    if (payload?.newBalance !== undefined && payload?.newBalance !== null) return toMinor(payload.newBalance);
    return null;
};
