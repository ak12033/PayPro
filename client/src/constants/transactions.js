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

export const TRANSACTION_CATEGORIES = [
    'General',
    'Food',
    'Transport',
    'Bills',
    'Shopping',
    'Health',
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
