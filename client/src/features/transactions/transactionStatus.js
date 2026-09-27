/**
 * Presentation for the transaction lifecycle.
 *
 * `status` is new on the server (see server/constants/transactionStatus.js);
 * older-shaped rows loaded from a cache or a stale client build simply won't
 * have it, so every lookup here falls back to a value that renders nothing.
 */
const STATUS_META = {
    PENDING: { label: 'Pending', tone: 'warning' },
    PROCESSING: { label: 'Processing', tone: 'warning' },
    SUCCESS: null, // the common case — no badge needed for "this just happened normally"
    FAILED: { label: 'Failed', tone: 'negative' },
    CANCELLED: { label: 'Cancelled', tone: 'neutral' },
    REFUNDED: { label: 'Refunded', tone: 'neutral' },
    PARTIALLY_REFUNDED: { label: 'Partially refunded', tone: 'neutral' },
};

/** `{ label, tone } | null` — null means "don't render a badge". */
export const statusMeta = (status) => STATUS_META[status] ?? null;

export default statusMeta;
