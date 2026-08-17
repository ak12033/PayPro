import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    description: { type: String, required: true, trim: true, maxlength: 280 },
    amount: { type: Number, required: true, min: 0 },
    type: { type: String, enum: ['Credit', 'Debit'], required: true },
    category: { type: String, trim: true, maxlength: 60, default: 'Others' },
    icon: { type: String, default: 'ShoppingBag' },
    invoiceId: { type: String, unique: true, required: true },
    riskScore: { type: Number, default: 0, min: 0, max: 100 },
    riskLevel: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
    riskReason: { type: String, default: '' },
    /**
     * Links the two legs of a P2P transfer so the pair can be reconciled, and
     * ties wallet credits back to the Payment that produced them.
     */
    transferGroupId: { type: String },
    paymentRef: { type: String },
    /**
     * Client-supplied de-duplication key. A double-clicked "Send" button, or an
     * axios retry after a timeout, previously produced two real transfers.
     * The unique index below makes the second attempt fail fast instead.
     */
    idempotencyKey: { type: String }
}, { timestamps: true });

/**
 * Every read path filters by userId and sorts by createdAt desc. Without this
 * compound index each dashboard load is a full collection scan.
 */
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ userId: 1, type: 1, createdAt: -1 });
transactionSchema.index({ userId: 1, category: 1, createdAt: -1 });
transactionSchema.index({ transferGroupId: 1 }, { sparse: true });
transactionSchema.index({ paymentRef: 1 }, { sparse: true });
transactionSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

export default mongoose.model('Transaction', transactionSchema);
