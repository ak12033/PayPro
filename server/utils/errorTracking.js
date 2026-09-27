/**
 * Error tracking (plan.md §39.2): Sentry, with PII scrubbing.
 *
 * Off unless `SENTRY_DSN` is set. When off, every export here is a cheap no-op
 * and `@sentry/node` is never even loaded, so development, tests and a
 * deployment without an account behave exactly as before.
 *
 * What reaches Sentry:
 *   - every `logger.error(...)` call (utils/logger.js forwards them), as an
 *     exception event when the log carries an `err` Error, otherwise as a
 *     message event;
 *   - nothing else automatically — no tracing unless
 *     `SENTRY_TRACES_SAMPLE_RATE` is set, no request bodies, no cookies.
 *
 * What never reaches it (§39.3): money amounts and balances, email addresses,
 * IP addresses, credentials of any kind. `scrubEvent` enforces that on every
 * event as it leaves the process, whatever the call site passed in — the
 * logger's own redaction is for the log sink and deliberately keeps amounts,
 * which are useful in logs we control and not in a third party's.
 *
 * This module must not import utils/logger.js: the logger imports it.
 */
import config from '../config/env.js';

let client = null;

/**
 * Keys whose values are removed from every event. Broader than the logger's
 * REDACT list on purpose: this data leaves our infrastructure.
 */
const SENSITIVE_KEY = /pass(word)?|secret|token|otp|authori[sz]ation|cookie|signature|api[-_]?key|fcm|firebase|amount|balance|email|^ip$|ip_?address|forwarded|real-ip|phone|card|upi|account[-_]?number/i;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
// Rupee figures in free text ("Added ₹500 via Razorpay").
const RUPEES = /₹\s?[\d,]+(?:\.\d+)?/g;

export const scrubString = (value) => (
    typeof value === 'string'
        ? value.replace(EMAIL, '[email]').replace(IPV4, '[ip]').replace(RUPEES, '₹[amount]')
        : value
);

const scrubValue = (value, depth = 0) => {
    if (typeof value === 'string') return scrubString(value);
    if (depth > 6 || value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1));

    const out = {};
    for (const [key, val] of Object.entries(value)) {
        out[key] = SENSITIVE_KEY.test(key) ? '[Filtered]' : scrubValue(val, depth + 1);
    }
    return out;
};

const DROPPED_HEADERS = /^(authorization|cookie|set-cookie|x-csrf-token|x-api-key|x-forwarded-for|x-real-ip|cf-connecting-ip|true-client-ip)$/i;

/**
 * Strip PII from a Sentry event. Pure, and exported so it is testable without
 * the SDK. Returns the event to send.
 */
export const scrubEvent = (event) => {
    if (!event || typeof event !== 'object') return event;
    const e = { ...event };

    // Only the opaque user id — never email, IP or username.
    if (e.user) e.user = e.user.id ? { id: String(e.user.id) } : undefined;

    if (e.request) {
        const { url, method, headers } = e.request;
        e.request = {
            method,
            // The query string can carry a search term that is an email.
            url: typeof url === 'string' ? url.split('?')[0] : url,
            headers: headers
                ? Object.fromEntries(Object.entries(headers).filter(([k]) => !DROPPED_HEADERS.test(k)))
                : undefined,
        };
    }

    if (e.message) e.message = scrubString(e.message);
    if (e.logentry?.message) e.logentry = { ...e.logentry, message: scrubString(e.logentry.message) };
    if (e.exception?.values) {
        e.exception = {
            ...e.exception,
            values: e.exception.values.map((v) => ({ ...v, value: scrubString(v.value) })),
        };
    }
    if (e.extra) e.extra = scrubValue(e.extra);
    if (e.contexts) e.contexts = scrubValue(e.contexts);
    if (e.tags) e.tags = scrubValue(e.tags);
    if (Array.isArray(e.breadcrumbs)) {
        e.breadcrumbs = e.breadcrumbs.map((b) => ({
            ...b,
            message: scrubString(b.message),
            data: b.data ? scrubValue(b.data) : b.data,
        }));
    }
    return e;
};

/**
 * Initialise once, at boot. Resolves `false` (and does nothing) without a DSN.
 * Never throws: failing to start error tracking must not stop the API.
 */
export const initErrorTracking = async () => {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn || client) return Boolean(client);

    try {
        const Sentry = await import('@sentry/node');
        Sentry.init({
            dsn,
            environment: process.env.SENTRY_ENVIRONMENT || config.NODE_ENV,
            release: process.env.SENTRY_RELEASE || undefined,
            sendDefaultPii: false,
            tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0,
            beforeSend: scrubEvent,
            beforeBreadcrumb: (crumb) => ({
                ...crumb,
                message: scrubString(crumb.message),
                data: crumb.data ? scrubValue(crumb.data) : crumb.data,
            }),
        });
        client = Sentry;
        return true;
    } catch (err) {
        // console, not logger: the logger forwards here, and this is the one
        // place that reports tracking itself being unavailable.
        console.error(`Error tracking disabled: ${err.message}`);
        return false;
    }
};

export const isErrorTrackingEnabled = () => Boolean(client);

/**
 * Called by `logger.error`. `err` (an Error), when present, becomes an
 * exception event with its stack; otherwise the message is sent as-is.
 * `context` is attached as `extra` and scrubbed by `beforeSend`.
 */
export const reportError = ({ message, err, context = {}, requestId, userId }) => {
    if (!client) return;
    try {
        client.withScope((scope) => {
            if (requestId) scope.setTag('requestId', requestId);
            if (userId) scope.setUser({ id: String(userId) });
            scope.setExtras({ ...context, logMessage: message });
            if (err instanceof Error) client.captureException(err);
            else client.captureMessage(message, 'error');
        });
    } catch {
        // Reporting must never be the thing that breaks a request.
    }
};

/** Drain queued events before the process exits. */
export const flushErrorTracking = async (timeoutMs = 2000) => {
    if (!client) return;
    try {
        await client.flush(timeoutMs);
    } catch {
        // best effort
    }
};

/** Test seam: install a fake client (or null to reset). */
export const __setErrorTrackingClient = (fake) => {
    client = fake;
};
