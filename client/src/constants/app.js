export const APP_NAME = 'PayPro';
export const APP_TAGLINE = 'PayPro AI';

export const CURRENCY_SYMBOL = '₹';
export const CURRENCY_LOCALE = 'en-IN';

/** Milliseconds before an in-flight request is abandoned. */
export const REQUEST_TIMEOUT_MS = 30_000;
export const REFRESH_TIMEOUT_MS = 15_000;

/** Debounce applied to search inputs that trigger a network request. */
export const SEARCH_DEBOUNCE_MS = 350;

/** Browser event used to broadcast "the session is gone" out of the axios layer. */
export const AUTH_EXPIRED_EVENT = 'auth-expired';
