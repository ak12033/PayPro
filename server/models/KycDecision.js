import mongoose from 'mongoose';
import { KYC_STATUSES, KYC_METHODS } from '../constants/kyc.js';

/**
 * One reviewer decision on a KYC submission (plan.md §0.20.2 "Audit trail").
 *
 * **Append-only, with no TTL.** `AuditLog` expires after 400 days (§29.4), and
 * how long verification records must be kept is itself a legal determination,
 * so these live in their own collection that nothing ages out. Every mutating
 * Mongoose query on this model throws (the hooks below) — a decision is
 * corrected by recording a new one, never by editing the old one.
 *
 * `notes` are internal and are never shown to the holder; `userVisibleReason`
 * is the part that is. `reference` is an internal case number, never a raw
 * identifier.
 */
const kycDecisionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    submissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'KycSubmission', required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    at: { type: Date, required: true },
    previousStatus: { type: String, enum: KYC_STATUSES, required: true },
    newStatus: { type: String, enum: KYC_STATUSES, required: true },
    method: { type: String, enum: [...KYC_METHODS, null], default: null },
    reference: { type: String, maxlength: 80, default: '' },
    notes: { type: String, maxlength: 2000, required: true },
    userVisibleReason: { type: String, maxlength: 500, default: '' },
    tierBefore: { type: String, required: true },
    tierAfter: { type: String, required: true },
    requestId: { type: String, default: null },
}, { timestamps: false, versionKey: false });

kycDecisionSchema.index({ submissionId: 1, at: -1 });
kycDecisionSchema.index({ userId: 1, at: -1 });

const refuse = function refuseMutation() {
    throw new Error('KycDecision is append-only: record a new decision instead of changing one');
};
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
    kycDecisionSchema.pre(op, refuse);
}

export default mongoose.model('KycDecision', kycDecisionSchema);
