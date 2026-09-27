/**
 * Transaction domain constants.
 *
 * The filter values are the server's preset names — they are sent verbatim as
 * `?filter=`, so they must not be renamed for display purposes. The labels are
 * kept separate for exactly that reason.
 */
export const TRANSACTION_FILTERS = [
    { value: 'All', label: 'All' },
    { value: 'Transfer', label: 'Sent' },
    { value: 'Received', label: 'Received' },
    { value: 'TopUp', label: 'Top-ups' },
    { value: 'Payment', label: 'Payments' },
    { value: 'Refund', label: 'Refunds' },
];

/** `All` means "no preset", not a preset literally named All. */
export const DEFAULT_TRANSACTION_FILTER = 'All';

/**
 * Date-range presets for the history page.
 *
 * Values are resolved to an ISO `startDate` client-side (`getRangeStartDate`
 * in `utils/formatters`) rather than sent as-is — the server's `/history`
 * endpoint takes a concrete timestamp, not a rolling window, so "Last 7 days"
 * has to mean something at the moment the request is made.
 */
export const DATE_RANGES = [
    { value: 'All', label: 'All time' },
    { value: 'Today', label: 'Today' },
    { value: '7d', label: 'Last 7 days' },
    { value: '30d', label: 'Last 30 days' },
    { value: '90d', label: 'Last 90 days' },
];

export const DEFAULT_DATE_RANGE = 'All';

/**
 * Fallback only. The canonical, authoritative list is
 * `server/constants/categories.js`, served at `GET /transactions/categories`
 * and fetched by `RecordTransaction` and `Activity` — this exists purely so
 * those screens have something to render before that request resolves (or if
 * it fails).
 */
export const TRANSACTION_CATEGORIES = [
    'General',
    'Food',
    'Groceries',
    'Transport',
    'Bills',
    'Shopping',
    'Health',
    'Entertainment',
    'Education',
    'Rent',
    'Travel',
    'Others',
];

export const TRANSACTION_TYPES = {
    EXPENSE: 'expense',
    INCOME: 'income',
};

/** The server writes 'Debit' / 'Credit' on the stored records. */
export const LEDGER_TYPES = {
    DEBIT: 'Debit',
    CREDIT: 'Credit',
};

export const HISTORY_PAGE_SIZE = 10;

/** How many of the recent transactions the dashboard preview shows. */
export const RECENT_PREVIEW_COUNT = 6;

/** Upper bound requested from `/transactions/recent`. */
export const RECENT_FETCH_LIMIT = 20;
