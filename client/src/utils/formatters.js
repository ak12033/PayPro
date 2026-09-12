import { CURRENCY_LOCALE, CURRENCY_SYMBOL } from '../constants/app';
import { LEDGER_TYPES } from '../constants/transactions';

/**
 * Presentation helpers.
 *
 * `₹${Number(v || 0).toLocaleString('en-IN')}` was written out by hand in seven
 * components, and three of them also carried their own private `formatDate`
 * with a different set of options.
 */

/**
 * Currency as a plain string, for the places that need text rather than the
 * `<Amount>` component — button labels, hints, toasts, aria descriptions.
 *
 * Both fraction digits are pinned. Left to its own devices `toLocaleString`
 * drops a trailing zero, so ₹48,250.50 rendered as "₹48,250.5" — which reads
 * as a truncated number and, in a product about money, invites the user to
 * wonder what else got rounded. Currency shows two decimals or it is wrong.
 */
export const formatCurrency = (value) =>
    `${CURRENCY_SYMBOL}${Number(value || 0).toLocaleString(CURRENCY_LOCALE, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;

/** Whole-rupee variant, for dense contexts where the paise are noise. */
export const formatCurrencyCompact = (value) =>
    `${CURRENCY_SYMBOL}${Number(value || 0).toLocaleString(CURRENCY_LOCALE, {
        maximumFractionDigits: 0,
    })}`;

export const formatNumber = (value) =>
    Number(value || 0).toLocaleString(CURRENCY_LOCALE);

/** Short form used in list rows: "04 March". */
export const formatDate = (value) =>
    new Date(value).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
    });

/** Long form used in tables: "04 March 2026". */
export const formatFullDate = (value) =>
    new Date(value).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
    });

export const formatTime = (value) =>
    new Date(value).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });

/** Compact date + time used by the payments table. */
export const formatDateTime = (value) =>
    new Date(value).toLocaleDateString(CURRENCY_LOCALE, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

/** `-₹1,200` for debits, `+₹1,200` for everything else. */
export const formatSignedCurrency = (amount, type) =>
    `${type === LEDGER_TYPES.DEBIT ? '-' : '+'}${formatCurrency(amount)}`;

/** `jo••@example.com` — keeps the first two characters and the domain. */
export const maskEmail = (email) => {
    if (!email) return '';
    return email.replace(/(^.{2})(.*)(@.*$)/, (_, head, body, domain) => {
        return `${head}${body.replace(/./g, '•')}${domain}`;
    });
};

export const calculatePercentage = (value, total) =>
    total ? ((value / total) * 100).toFixed(1) : '0.0';

/**
 * "2 minutes ago", "yesterday", "3 Mar".
 *
 * Uses `Intl.RelativeTimeFormat` rather than hand-rolled arithmetic so the
 * output is localised and correctly pluralised, and falls back to an absolute
 * date beyond a week — "43 days ago" is a number the reader has to convert
 * back into a date, which defeats the point.
 */
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export const formatRelativeTime = (value) => {
    const then = new Date(value);
    if (Number.isNaN(then.getTime())) return '';

    const seconds = Math.round((then - Date.now()) / 1000);
    const absolute = Math.abs(seconds);

    if (absolute < 45) return 'just now';
    if (absolute < 3600) return relative.format(Math.round(seconds / 60), 'minute');
    if (absolute < 86400) return relative.format(Math.round(seconds / 3600), 'hour');
    if (absolute < 604800) return relative.format(Math.round(seconds / 86400), 'day');

    return then.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

/**
 * Day heading for a grouped ledger: "Today", "Yesterday", or "Mon, 3 March".
 *
 * Transactions are grouped by day, and "Today" carries more meaning at a glance
 * than the date does — most of what a user checks is whether something arrived
 * *today*.
 */
export const formatDayLabel = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round(
        (startOfDay(new Date()) - startOfDay(date)) / 86_400_000
    );

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';

    return date.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'long',
        // Drop the year for the current year: it is noise on every row until
        // the user scrolls back far enough for it to matter.
        ...(date.getFullYear() !== new Date().getFullYear() && { year: 'numeric' }),
    });
};

/**
 * Converts a `DATE_RANGES` preset key into an ISO `startDate` for the API.
 *
 * `null` for `'All'` (or anything unrecognised) rather than a token the
 * server has to special-case — "no start date" already means "no lower
 * bound" to `/transactions/history`.
 */
export const getRangeStartDate = (range) => {
    if (!range || range === 'All') return null;
    if (range === 'Today') {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    }
    const days = { '7d': 7, '30d': 30, '90d': 90 }[range];
    return days ? new Date(Date.now() - days * 86_400_000).toISOString() : null;
};

/** Groups a chronological list into `[{ key, label, items }]` by calendar day. */
export const groupByDay = (items, getDate = (item) => item.createdAt) => {
    const buckets = new Map();

    for (const item of items) {
        const date = new Date(getDate(item));
        if (Number.isNaN(date.getTime())) continue;

        const key = date.toDateString();
        if (!buckets.has(key)) {
            buckets.set(key, { key, label: formatDayLabel(date), items: [] });
        }
        buckets.get(key).items.push(item);
    }

    return Array.from(buckets.values());
};

/**
 * "Chrome on Windows" out of a raw user-agent string.
 *
 * The security screen lists the devices holding a live session, and the raw UA
 * — `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 …` — is not
 * something a person can use to decide whether they recognise a device. This is
 * a lossy summary on purpose; the full string is still available on the row.
 */
export const describeDevice = (userAgent = '') => {
    if (!userAgent || userAgent === 'Unknown device') return 'Unknown device';

    const browser =
        /Edg\//.test(userAgent) ? 'Edge'
        : /OPR\//.test(userAgent) ? 'Opera'
        : /Chrome\//.test(userAgent) ? 'Chrome'
        : /Safari\//.test(userAgent) ? 'Safari'
        : /Firefox\//.test(userAgent) ? 'Firefox'
        : 'Browser';

    const platform =
        /iPhone|iPad|iPod/.test(userAgent) ? 'iOS'
        : /Android/.test(userAgent) ? 'Android'
        : /Mac OS X/.test(userAgent) ? 'macOS'
        : /Windows/.test(userAgent) ? 'Windows'
        : /Linux/.test(userAgent) ? 'Linux'
        : 'Unknown OS';

    return `${browser} on ${platform}`;
};

/**
 * 'mobile' | 'desktop' | 'unknown' from a user-agent string.
 *
 * Drives the icon on a session row. Every device previously rendered a laptop,
 * so a user scanning their sign-ins for the phone they left on a train saw
 * three identical laptop icons and had to read the text on each.
 */
export const getDeviceKind = (userAgent = '') => {
    if (!userAgent || userAgent === 'Unknown device') return 'unknown';
    return /iPhone|iPad|iPod|Android|Mobile/.test(userAgent) ? 'mobile' : 'desktop';
};
