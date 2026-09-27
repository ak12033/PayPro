import mongoose from 'mongoose';

/**
 * A self-reported debt (plan.md §22 "self-reported debt tracker"): a loan or
 * card balance the holder records so their net worth and monthly commitments
 * account for it.
 *
 * PayPro does not lend, does not collect repayments, and reads nothing from a
 * credit bureau. Nothing here is a credit score or an eligibility judgement,
 * and no screen may present it as one (§22). Never touches the ledger.
 */
export const LIABILITY_KINDS = ['home_loan', 'vehicle_loan', 'personal_loan', 'education_loan', 'credit_card', 'other'];

const liabilitySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: LIABILITY_KINDS, required: true },
    lender: { type: String, required: true, trim: true, maxlength: 120 },
    outstandingMinor: { type: Number, min: 0, required: true },
    outstandingUpdatedAt: { type: Date, required: true },
    /** Annual rate in percent, as the holder states it. */
    interestRate: { type: Number, min: 0, max: 100, default: null },
    emiMinor: { type: Number, min: 0, default: null },
    /** Day of the month the EMI is due, 1–28. */
    emiDueDay: { type: Number, min: 1, max: 28, default: null },
    endDate: { type: Date, default: null },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
    archivedAt: { type: Date, default: null },
}, { timestamps: true });

liabilitySchema.index({ userId: 1, archivedAt: 1 });

export default mongoose.model('Liability', liabilitySchema);
