import mongoose from 'mongoose';

/**
 * A persisted deterministic insight (plan.md §24.3). `source` is always
 * 'deterministic' in this phase — there is no Gemini-narrative pipeline
 * writing to this collection yet (plan.md §24.2.1-24.2.3 stay out of scope
 * for Phase 3) — but the field exists so the client's `InsightCard` has a
 * stable way to distinguish a computed fact from an AI-authored one whenever
 * that pipeline does land, without a later migration.
 */
const insightSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    kind: {
        type: String,
        enum: [
            'CATEGORY_SPIKE',
            'BUDGET_PACE',
            'LOW_SAVINGS_RATE',
            'UNUSUAL_LARGE_TXN',
            'INCOME_GAP',
            'GOAL_BEHIND',
            /**
             * Added in Phase 4 alongside `RecurringExpense` (plan.md §18), which is
             * what both of these need to exist. §24.3's rule list is now complete.
             */
            'RECURRING_INCREASE',
            'NEW_RECURRING',
        ],
        required: true,
    },
    title: { type: String, required: true, maxlength: 140 },
    body: { type: String, required: true, maxlength: 500 },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info' },
    source: { type: String, enum: ['deterministic'], default: 'deterministic' },
    /** The IST-month key ('YYYY-MM') this insight was computed for. */
    periodStart: { type: Date, required: true },
    /** The numbers that produced this insight, so the card can show its working. */
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    dismissedAt: { type: Date, default: null },
}, { timestamps: true });

insightSchema.index({ userId: 1, dismissedAt: 1, createdAt: -1 });

export default mongoose.model('Insight', insightSchema);
