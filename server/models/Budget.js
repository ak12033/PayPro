import mongoose from 'mongoose';

/**
 * A monthly spending plan, layered over the ledger rather than containing it.
 *
 * `periodStart`/`periodEnd` are real UTC instants marking the boundaries of an
 * IST calendar month (see `utils/period.js`'s `monthBoundsIST`) — not strings —
 * so every spend query can range-match directly against `Transaction.postedAt`
 * without re-deriving month boundaries at read time.
 *
 * Spend is never stored here. `totalLimitMinor`/`categories[].limitMinor` are
 * the only numbers this document owns; how much of them has been used is
 * always computed fresh from `Transaction` by `budgetService.computeSpend` —
 * a denormalised running total would silently drift the first time a
 * transaction was refunded or re-categorised.
 */
const budgetSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    periodType: { type: String, enum: ['monthly'], default: 'monthly' },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    currency: { type: String, default: 'INR' },
    totalLimitMinor: { type: Number, min: 0 },
    expectedIncomeMinor: { type: Number, min: 0 },
    categories: [{
        _id: false,
        category: { type: String, required: true },
        limitMinor: { type: Number, required: true, min: 0 },
    }],
    /** Carry unspent allowance into next period's rollover (§13.5), capped at 2x. */
    rollover: { type: Boolean, default: false },
    /** Auto-materialise next period from this one via the monthly cron. */
    recurring: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null },
}, { timestamps: true });

/** One budget per user per period — the constraint that makes "September budget" unambiguous. */
budgetSchema.index({ userId: 1, periodStart: -1 }, { unique: true });
/** The monthly rollover cron's working set. */
budgetSchema.index({ userId: 1, recurring: 1 });

export default mongoose.model('Budget', budgetSchema);
