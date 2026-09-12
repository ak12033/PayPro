export const QUICK_TOPUP_AMOUNTS = [500, 1000, 2000, 5000];

/**
 * Presets for the send flow.
 *
 * Lower than the top-up presets on purpose: people top up in round hundreds and
 * thousands, but the median peer-to-peer transfer is a split bill. Reusing the
 * top-up ladder here would put ₹5,000 one tap away from an accidental send.
 */
export const QUICK_SEND_AMOUNTS = [100, 250, 500, 1000];

export const RAZORPAY_CHECKOUT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

/**
 * Razorpay's checkout is an iframe we do not control the internals of, so the
 * best we can do is hand it a colour that matches the app. It is read at call
 * time from the live theme rather than hardcoded, so the payment sheet does not
 * arrive as a dark slab in the middle of a light-themed session.
 *
 * Resolved off the computed token rather than a literal. The previous literal
 * was `#2563eb` — the blue the product used *before* the palette moved to
 * cyan, which is exactly the failure mode a duplicated colour has: the theme
 * moved and the checkout sheet stayed behind, so the one screen where a user
 * hands over card details was the one screen that looked like a different app.
 */
export const getRazorpayThemeColor = () => {
    const styles = getComputedStyle(document.documentElement);
    const token =
        document.documentElement.getAttribute('data-theme') === 'dark'
            ? '--color-surface'
            : '--color-accent';

    // Razorpay rejects anything that is not a hex string, and a token could in
    // principle resolve to empty if the sheet has not parsed yet.
    const value = styles.getPropertyValue(token).trim();
    return /^#[0-9a-f]{3,8}$/i.test(value) ? value : '#0e7490';
};

/**
 * Payment lifecycle, as Razorpay reports it.
 *
 * Each status now carries the *label the user should read*, not just a colour.
 * The previous map was four Tailwind class strings keyed by status, so the only
 * thing distinguishing "created" from "failed" in the UI was hue — and
 * "created" was rendered in amber, which reads as a warning when it actually
 * means "we are waiting for the bank".
 */
export const PAYMENT_STATUS = {
    captured: { label: 'Completed', tone: 'positive' },
    created: { label: 'Processing', tone: 'warning' },
    authorized: { label: 'Processing', tone: 'warning' },
    failed: { label: 'Failed', tone: 'negative' },
    refunded: { label: 'Refunded', tone: 'info' },
};

export const PAYMENT_STATUS_FALLBACK = { label: 'Unknown', tone: 'neutral' };

export const getPaymentStatus = (status) =>
    PAYMENT_STATUS[status] ?? PAYMENT_STATUS_FALLBACK;
