import mongoose from 'mongoose';

/**
 * "Always categorise <merchant> as <category>" (plan.md §12.4, P2).
 *
 * Slot 3 in `categoryService`'s resolution order: below an explicit user choice
 * on the request and below a system category, above AI categorisation. That
 * placement is the whole design — a rule is a *standing* user preference, so it
 * outranks a model's guess, but it must never override what the user just typed
 * on this particular transaction.
 *
 * `merchantKey` is the same normalised string recurring detection groups on
 * (`recurringService.normaliseMerchant`), reused deliberately: a user who tells
 * us "Netflix is Entertainment" means every Netflix charge, whatever order id
 * that month's description carries.
 */
const categoryRuleSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    merchantKey: { type: String, required: true },
    /** The raw description the rule was created from, so the UI can show what it matched. */
    sampleDescription: { type: String, maxlength: 280 },
    category: { type: String, required: true, trim: true, maxlength: 60 },
    /** How many transactions this rule has categorised since it was created. */
    appliedCount: { type: Number, default: 0 },
    lastAppliedAt: { type: Date, default: null },
}, { timestamps: true });

/** One rule per user per merchant — a second "always" replaces the first. */
categoryRuleSchema.index({ userId: 1, merchantKey: 1 }, { unique: true });

export default mongoose.model('CategoryRule', categoryRuleSchema);
