import mongoose from 'mongoose';

/**
 * A *detected* recurring payment (plan.md §18.2).
 *
 * Nothing here is authoritative. Every row is the output of a heuristic over
 * past transactions (`services/recurringService.js`), which is why `confidence`
 * is stored alongside the prediction and why `status` has a `dismissed` value:
 * the user must always be able to say "that isn't a subscription" and have the
 * detector stop re-asserting it.
 *
 * PayPro cannot cancel a third-party subscription, and no field here implies
 * it can — there is no `cancelRequestedAt`, no provider handle. `status:
 * 'cancelled'` means *the user told us they cancelled it elsewhere*, so the
 * forecast stops counting it; it is a note, not an action.
 */
const recurringExpenseSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    /**
     * The normalised merchant string detection grouped on
     * (`recurringService.normaliseMerchant`). Stable across runs, which is what
     * makes the upsert idempotent — a second detection pass updates the same
     * row rather than creating a near-duplicate.
     */
    merchantKey: { type: String, required: true },
    /** What the user sees. Defaults to the most recent raw description; renameable. */
    displayName: { type: String, required: true, trim: true, maxlength: 80 },
    category: { type: String, trim: true, maxlength: 60, default: 'Subscription' },
    /**
     * Icon *name*, resolved from `category` by `categoryService.iconFor` — the
     * same arrangement `Transaction.icon` uses, so the client's existing
     * `getTransactionIcon` lookup works here unchanged rather than needing a
     * second category-to-icon map in the browser.
     */
    icon: { type: String, default: 'RefreshCcw' },
    /** Representative amount (the median of the group), in integer paise. */
    amountMinor: { type: Number, required: true, min: 0 },
    /** True when amounts vary beyond the equality case but stay within the CV band. */
    amountVariesFlag: { type: Boolean, default: false },
    cadence: { type: String, enum: ['weekly', 'monthly', 'quarterly', 'yearly'], required: true },
    firstSeenAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    nextExpectedAt: { type: Date, required: true },
    occurrences: { type: Number, required: true, min: 0 },
    /** 0-1. Below `MIN_CONFIDENCE` the detector does not write a row at all. */
    confidence: { type: Number, required: true, min: 0, max: 1 },
    status: {
        type: String,
        enum: ['active', 'paused', 'cancelled', 'dismissed'],
        default: 'active',
    },
    /**
     * Set when a user renames or re-categorises a detection. Detection then
     * stops overwriting those two fields on subsequent runs — otherwise the
     * nightly job would silently undo every correction the user made.
     */
    userEdited: { type: Boolean, default: false },
    transactionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' }],
}, { timestamps: true });

/** One detection per user per merchant — the key the nightly upsert matches on. */
recurringExpenseSchema.index({ userId: 1, merchantKey: 1 }, { unique: true });
/** The forecast query: "what is due in the next 30 days?" (plan.md §18.3). */
recurringExpenseSchema.index({ userId: 1, status: 1, nextExpectedAt: 1 });

export default mongoose.model('RecurringExpense', recurringExpenseSchema);
