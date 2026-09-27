import mongoose from 'mongoose';

/**
 * A held or blocked money movement awaiting human review (plan.md §30.2.3).
 *
 * The `autoReleaseAt` field is the important one. A review queue that nobody
 * staffs is worse than no queue at all: it converts "your transfer was
 * suspicious" into "your money is gone and nobody will tell you when it comes
 * back". Every held case therefore carries its own deadline, and the cron
 * releases it with an audit entry when that passes.
 *
 * Blocked cases (score >= the block band) get no auto-release — a block is a
 * refusal to move money, not a hold on money already committed, so there is
 * nothing stranded that a timer needs to free.
 */
const riskCaseSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    /** Null for a blocked attempt: no transaction was ever written. */
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
    score: { type: Number, required: true, min: 0, max: 100 },
    /** What the transfer would have been, preserved so a reviewer can judge it. */
    intent: {
        kind: { type: String, enum: ['transfer', 'topup', 'other'], default: 'transfer' },
        amount: { type: Number },
        recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        recipientName: { type: String },
    },
    /** The deterministic rules that fired, with their weights and detail. */
    rules: [{
        _id: false,
        code: String,
        weight: Number,
        detail: String,
    }],
    /** The model's own contribution, recorded separately so it can be audited independently. */
    modelScore: { type: Number, default: null },
    modelReason: { type: String, default: '' },
    action: { type: String, enum: ['hold', 'block'], required: true },
    status: {
        type: String,
        enum: ['open', 'approved', 'rejected', 'auto_released'],
        default: 'open',
    },
    priority: { type: String, enum: ['normal', 'urgent'], default: 'normal' },
    /**
     * Handed up to an admin by a reviewer (plan.md §28.2). The case stays
     * `open`; `escalation.at` being set is what restricts the decision to the
     * admin role. Escalating twice is refused.
     */
    escalation: {
        at: { type: Date, default: null },
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        reason: { type: String, maxlength: 1000, default: '' },
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    notes: { type: String, maxlength: 1000, default: '' },
    /** Null for blocks — see the class comment. */
    autoReleaseAt: { type: Date, default: null },
}, { timestamps: true });

/** The agent queue: oldest urgent open case first. */
riskCaseSchema.index({ status: 1, priority: -1, createdAt: 1 });
/** "Show me my own held transfers". */
riskCaseSchema.index({ userId: 1, status: 1, createdAt: -1 });
/** The auto-release sweep. */
riskCaseSchema.index({ status: 1, autoReleaseAt: 1 });

export default mongoose.model('RiskCase', riskCaseSchema);
