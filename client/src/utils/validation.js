/**
 * Shared, framework-free validators.
 *
 * The rules themselves were previously inlined in each submit handler, which is
 * why the transfer screen rejected non-finite amounts while the top-up screen
 * happily accepted them.
 */

export const isNonEmpty = (value) => Boolean(String(value ?? '').trim());

export const isPositiveAmount = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0;
};

export const toAmount = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

export const isCompleteOtp = (value, length = 6) =>
    String(value ?? '').length === length;

/** Strips everything that is not a digit — used by the OTP inputs. */
export const digitsOnly = (value) => String(value ?? '').replace(/\D/g, '');

/**
 * Client-side email shape check.
 *
 * Deliberately permissive. The server is the authority on whether an address is
 * acceptable, and an over-strict client regex — the kind that rejects `+`
 * aliases or new TLDs — locks legitimate users out of their own signup with an
 * error they cannot act on. This catches typos, nothing more.
 */
export const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? '').trim());
