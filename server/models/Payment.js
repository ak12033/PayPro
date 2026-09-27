import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    orderId: {
        type: String,
        required: true,
        unique: true
    },
    paymentId: {
        type: String
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    currency: {
        type: String,
        default: 'INR'
    },
    status: {
        type: String,
        enum: ['created', 'captured', 'failed', 'refunded'],
        default: 'created'
    },
    receipt: {
        type: String
    },
    refundId: {
        type: String
    },
    /**
     * Set once the wallet has actually been credited for this order.
     *
     * The capture path and the webhook path both used to credit the balance
     * after independently reading `status`, so a webhook arriving while
     * /payments/verify was in flight double-credited the user. Crediting is now
     * gated on a single atomic transition into this flag.
     */
    walletCredited: { type: Boolean, default: false },
    walletDebitedOnRefund: { type: Boolean, default: false }
}, { timestamps: true });

// History page: filter by user, newest first.
paymentSchema.index({ userId: 1, createdAt: -1 });
// Refund webhooks look payments up by gateway payment id.
// sparse, because paymentId is null until the order is actually paid.
paymentSchema.index({ paymentId: 1 }, { sparse: true });
// analyticsController.getPaymentsStatus and reconciliationService both run
// countDocuments/aggregate keyed on status; without this it's a collection scan.
paymentSchema.index({ status: 1 });

export default mongoose.model('Payment', paymentSchema);
