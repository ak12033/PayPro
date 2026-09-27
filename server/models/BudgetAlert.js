import mongoose from 'mongoose';

/**
 * One row per threshold crossing, ever. This document's whole reason to exist
 * is its unique index below — without it, every transaction that lands after
 * a category first crosses 80% would fire the "80%" notification again.
 *
 * `userId` is denormalised off `Budget` (rather than requiring a join) so
 * `budgetService`'s "at most 3 budget notifications per user per day" cap
 * (§14.2) can be a single indexed count query.
 */
const budgetAlertSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    budgetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Budget', required: true },
    /** null = a total-budget alert, not tied to one category. */
    category: { type: String, default: null },
    /** 50 | 80 | 100 | 120 (category) or 80 (total) — see constants/budget.js on the client for the shared copy. */
    threshold: { type: Number, required: true },
    periodStart: { type: Date, required: true },
    firedAt: { type: Date, default: Date.now },
    notificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification' },
}, { timestamps: false });

/** The dedupe guarantee: this exact threshold, for this category, in this period, fires at most once. */
budgetAlertSchema.index({ budgetId: 1, category: 1, threshold: 1, periodStart: 1 }, { unique: true });
/** The daily notification cap query. */
budgetAlertSchema.index({ userId: 1, firedAt: -1 });

export default mongoose.model('BudgetAlert', budgetAlertSchema);
