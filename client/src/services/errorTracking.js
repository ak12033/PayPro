import { env } from '../app/config/env';

/**
 * Error tracking for the SPA (plan.md §39.2): Sentry, with PII scrubbing.
 *
 * Off unless `VITE_SENTRY_DSN` is set. `@sentry/react` is loaded with a
 * dynamic import, so it is its own chunk and a build without a DSN never
 * downloads it. When on, the SDK's default integrations report uncaught errors
 * and unhandled rejections; `ErrorBoundary` reports render errors through
 * `reportError`.
 *
 * Nothing leaves the browser before `scrubEvent` has removed money amounts,
 * balances, email addresses, IPs and credentials (§39.3). A wallet app's
 * breadcrumbs are full of them — every API URL, every form field — so the
 * scrubbing is not optional hardening, it is the precondition for turning this
 * on at all. Mirrors server/utils/errorTracking.js.
 */

const SENSITIVE_KEY = /pass(word)?|secret|token|otp|authori[sz]ation|cookie|signature|api[-_]?key|fcm|firebase|amount|balance|email|^ip$|ip_?address|forwarded|phone|card|upi|account[-_]?number/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const RUPEES = /₹\s?[\d,]+(?:\.\d+)?/g;

export const scrubString = (value) => (
    typeof value === 'string'
        ? value.replace(EMAIL, '[email]').replace(IPV4, '[ip]').replace(RUPEES, '₹[amount]')
        : value
);

/** A URL minus its query string, which can carry a searched name or email. */
const stripQuery = (url) => (typeof url === 'string' ? url.split('?')[0] : url);

const scrubValue = (value, depth = 0) => {
    if (typeof value === 'string') return scrubString(value);
    if (depth > 6 || value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1));

    const out = {};
    for (const [key, val] of Object.entries(value)) {
        if (SENSITIVE_KEY.test(key)) out[key] = '[Filtered]';
        else if (key === 'url' || key === 'from' || key === 'to') out[key] = scrubString(stripQuery(val));
        else out[key] = scrubValue(val, depth + 1);
    }
    return out;
};

export const scrubBreadcrumb = (crumb) => {
    if (!crumb) return crumb;
    return {
        ...crumb,
        message: scrubString(crumb.message),
        data: crumb.data ? scrubValue(crumb.data) : crumb.data,
    };
};

/** Strip PII from a Sentry event. Pure; exported for tests. */
export const scrubEvent = (event) => {
    if (!event || typeof event !== 'object') return event;
    const e = { ...event };

    if (e.user) e.user = e.user.id ? { id: String(e.user.id) } : undefined;
    if (e.request) {
        e.request = {
            url: stripQuery(e.request.url),
            headers: e.request.headers?.['User-Agent'] ? { 'User-Agent': e.request.headers['User-Agent'] } : undefined,
        };
    }
    if (e.message) e.message = scrubString(e.message);
    if (e.exception?.values) {
        e.exception = {
            ...e.exception,
            values: e.exception.values.map((v) => ({ ...v, value: scrubString(v.value) })),
        };
    }
    if (e.extra) e.extra = scrubValue(e.extra);
    if (e.contexts) e.contexts = scrubValue(e.contexts);
    if (e.tags) e.tags = scrubValue(e.tags);
    if (Array.isArray(e.breadcrumbs)) e.breadcrumbs = e.breadcrumbs.map(scrubBreadcrumb);
    return e;
};

let sentry = null;
// Errors raised while the SDK chunk is still downloading, replayed once it lands.
const pending = [];
const MAX_PENDING = 10;

/** Start error tracking if configured. Safe to call once, at startup; never throws. */
export const initErrorTracking = async () => {
    if (!env.sentryDsn || sentry) return Boolean(sentry);
    try {
        const Sentry = await import('@sentry/react');
        Sentry.init({
            dsn: env.sentryDsn,
            environment: env.sentryEnvironment || import.meta.env.MODE,
            release: env.sentryRelease || undefined,
            sendDefaultPii: false,
            tracesSampleRate: 0,
            beforeSend: scrubEvent,
            beforeBreadcrumb: scrubBreadcrumb,
        });
        sentry = Sentry;
        pending.splice(0).forEach(({ error, context }) => reportError(error, context));
        return true;
    } catch {
        return false;
    }
};

/** Report a caught error. A no-op when tracking is off. */
export const reportError = (error, context = {}) => {
    if (!sentry) {
        if (env.sentryDsn && pending.length < MAX_PENDING) pending.push({ error, context });
        return;
    }
    try {
        sentry.withScope((scope) => {
            scope.setExtras(context);
            sentry.captureException(error);
        });
    } catch {
        // Reporting must never be what breaks the page.
    }
};

/** Test seam. */
export const __setErrorTrackingClient = (client) => {
    sentry = client;
};
