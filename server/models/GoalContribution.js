import mongoose from 'mongoose';

/**
 * A single add/withdraw against a Goal's tracked progress. `transactionId` is
 * nullable and, in this phase, always null — a contribution never moves real
 * wallet money (plan.md §15.2), so there is no ledger row to point at yet.
 * The field exists now so the P3 upgrade path (a real reserved-balance pot,
 * documented in plan.md §15.2) has somewhere to record the paired
 * `Transaction` once one exists, without a schema change.
 */
const goalContributionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    goalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Goal', required: true },
    amountMinor: { type: Number, required: true, min: 1 },
    direction: { type: String, enum: ['in', 'out'], required: true },
    source: { type: String, enum: ['manual', 'auto', 'reallocation'], default: 'manual' },
    note: { type: String, maxlength: 280, default: '' },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
    at: { type: Date, default: Date.now },
}, { timestamps: true });

goalContributionSchema.index({ goalId: 1, at: -1 });

export default mongoose.model('GoalContribution', goalContributionSchema);
