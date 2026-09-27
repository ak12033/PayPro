import mongoose from 'mongoose';

/**
 * A request to move wallet money to the holder's own verified bank account
 * (plan.md §0.20.3), executed by an operator's bank transfer (the 2026-09-27
 * decision; Appendix B Q10). There is no payout API.
 *
 *   requested ──approve──▶ processing ──mark paid (UTR)──▶ paid
 *       │                      └──bank failed──▶ failed      (money returned)
 *       ├──reject──▶ rejected                                  (money returned)
 *       └──holder cancels──▶ cancelled                         (money returned)
 *
 * The money leaves the wallet at `requested`, as a PENDING hold on the ledger
 * (`ledgerService.holdFunds`); `transactionId` is that row. Its status mirrors
 * this one: PENDING → PROCESSING → SUCCESS, or FAILED/CANCELLED with the money
 * credited back (`ledgerService.releaseHold`). This document is the workflow
 * and the review trail; the ledger row is the money.
 *
 * `bank` is a snapshot at request time, so a later edit or removal of the
 * account cannot change what this request said it would pay to.
 */
export const WITHDRAWAL_STATUSES = ['requested', 'processing', 'paid', 'rejected', 'failed', 'cancelled'];
export const OPEN_WITHDRAWAL_STATUSES = ['requested', 'processing'];

const withdrawalRequestSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    bankAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount', required: true },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', required: true },
    amountMinor: { type: Number, required: true, min: 1 },
    status: { type: String, enum: WITHDRAWAL_STATUSES, default: 'requested' },
    bank: {
        holderName: String,
        accountNumberMasked: String,
        ifsc: String,
        bankName: String,
    },
    /** The bank's reference for the transfer (UTR), recorded when it is marked paid. */
    payoutReference: { type: String, trim: true, maxlength: 60, default: '' },
    payoutMethod: { type: String, enum: ['operator_bank_transfer'], default: 'operator_bank_transfer' },
    paidAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    /** Shown to the holder on reject/fail. */
    userVisibleReason: { type: String, maxlength: 500, default: '' },
    internalNotes: { type: String, maxlength: 1000, default: '' },
    /** Set when a bank statement import matched this request (`withdrawalService.matchStatement`). */
    statementMatchedAt: { type: Date, default: null },
    statusHistory: [{
        _id: false,
        from: { type: String, default: null },
        to: String,
        at: { type: Date, default: Date.now },
        actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        reason: { type: String, maxlength: 500, default: '' },
    }],
}, { timestamps: true });

withdrawalRequestSchema.index({ userId: 1, createdAt: -1 });
withdrawalRequestSchema.index({ status: 1, createdAt: 1 });
withdrawalRequestSchema.index({ payoutReference: 1 }, { partialFilterExpression: { payoutReference: { $gt: '' } } });

export default mongoose.model('WithdrawalRequest', withdrawalRequestSchema);
