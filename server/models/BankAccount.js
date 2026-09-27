import mongoose from 'mongoose';

/**
 * A holder's own bank account, as a withdrawal destination (plan.md §0.20.3).
 *
 * Verified by an admin, not by an external bank-account check (the 2026-09-27
 * decision): the holder adds the account and can attach proof (a cancelled
 * cheque, a statement), and an admin compares the holder name against the
 * VERIFIED KYC legal name and the proof before marking it `verified`. Only a
 * verified account can receive a withdrawal.
 *
 * The account number is encrypted (`accountNumberEncrypted`, select:false).
 * Every screen shows `accountNumberMasked`. The full number is decrypted only
 * for the admin who is about to send money to it, and that reveal is audited.
 */
export const BANK_ACCOUNT_STATUSES = ['pending', 'verified', 'rejected', 'removed'];

const bankAccountSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    holderName: { type: String, required: true, trim: true, maxlength: 120 },
    accountNumberMasked: { type: String, required: true },
    accountNumberEncrypted: { type: String, required: true, select: false },
    accountNumberFingerprint: { type: String, required: true },
    /** Indian Financial System Code: `AAAA0XXXXXX`. */
    ifsc: { type: String, required: true, uppercase: true, trim: true, maxlength: 11 },
    bankName: { type: String, trim: true, maxlength: 80, default: '' },
    status: { type: String, enum: BANK_ACCOUNT_STATUSES, default: 'pending' },
    /** Shown to the holder when an admin rejects the account. */
    userVisibleReason: { type: String, maxlength: 500, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    reviewNotes: { type: String, maxlength: 1000, default: '' },
    removedAt: { type: Date, default: null },
}, { timestamps: true });

bankAccountSchema.index({ userId: 1, status: 1, createdAt: -1 });
bankAccountSchema.index({ status: 1, createdAt: 1 });
/** The same account on two customers is an AML signal (`SHARED_IDENTIFIER`), not an error. */
bankAccountSchema.index({ accountNumberFingerprint: 1 });

export default mongoose.model('BankAccount', bankAccountSchema);
