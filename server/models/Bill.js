import mongoose from 'mongoose';

/**
 * A bill *reminder*, not a bill payment (plan.md §19.2).
 *
 * Real bill payment needs BBPS connectivity, an aggregator, a payout rail and
 * RBI authorisation — none of which exist in this repository (§19.1). What is
 * honest to build is a tracker that moves no money, and this model is shaped to
 * make the dishonest version hard to write by accident:
 *
 *   - there is no `payBill` path anywhere that writes to this collection;
 *   - `paidTransactionId` *links* an existing transaction, it never creates
 *     one — marking a bill paid is bookkeeping over money that already moved;
 *   - there is no biller id, no provider handle, no settlement state.
 *
 * Every screen that renders one of these must say so ("Reminder only").
 */
const billSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    billerName: { type: String, required: true, trim: true, maxlength: 80 },
    category: { type: String, trim: true, maxlength: 60, default: 'Bills' },
    /** Icon name resolved from `category` — see the note on `RecurringExpense.icon`. */
    icon: { type: String, default: 'Receipt' },
    /** The user's own account/customer reference with the biller. Free text; never validated against anything. */
    customerRef: { type: String, trim: true, maxlength: 80 },
    amountMinor: { type: Number, min: 0 },
    dueDate: { type: Date, required: true },
    frequency: {
        type: String,
        enum: ['once', 'weekly', 'monthly', 'quarterly', 'yearly'],
        default: 'monthly',
    },
    /**
     * 'overdue' is never stored — it is derived at read time from `dueDate` vs
     * now, because a stored value would be wrong for every bill between the
     * moment it lapses and the next cron tick. See `billService.decorate`.
     */
    status: {
        type: String,
        enum: ['upcoming', 'paid', 'skipped'],
        default: 'upcoming',
    },
    /** Links an existing Transaction. Marking paid never *creates* one. */
    paidTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
    paidAt: { type: Date, default: null },
    reminderDaysBefore: { type: Number, default: 3, min: 0, max: 30 },
    /** Set when this bill was seeded from a detection rather than typed in. */
    autoDetectedFromRecurringId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'RecurringExpense',
        default: null,
    },
    archivedAt: { type: Date, default: null },
}, { timestamps: true });

/** The list view and the reminder cron's working set. */
billSchema.index({ userId: 1, status: 1, dueDate: 1 });
/**
 * At most one live bill per auto-detected recurring payment, so the nightly
 * seeding pass is idempotent. Partial rather than sparse: a compound sparse
 * index still indexes every row where `userId` is present (see the same
 * reasoning on `Notification.dedupeKey`).
 */
billSchema.index(
    { userId: 1, autoDetectedFromRecurringId: 1 },
    { unique: true, partialFilterExpression: { autoDetectedFromRecurringId: { $type: 'objectId' } } }
);

export default mongoose.model('Bill', billSchema);
