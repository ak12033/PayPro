import mongoose from 'mongoose';

/**
 * A support ticket (plan.md §27.1).
 *
 * `ticketNumber` is human-quotable on purpose — a user on the phone reads it
 * out, and a 24-character ObjectId is not something anyone reads out correctly.
 * It is generated in `supportService`, not here, so the format lives next to
 * the collision-retry logic that depends on it.
 *
 * Messages are embedded rather than a separate collection: a thread is read in
 * its entirety or not at all, it is bounded by `MAX_MESSAGES` in the service,
 * and the 16MB document ceiling is nowhere near reachable for text-only
 * messages. Attachments would change that calculus — they need object storage,
 * which does not exist here (§27.3), so `attachments` is present as the seam
 * and always empty.
 */
const supportTicketSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ticketNumber: { type: String, required: true, unique: true },
    category: {
        type: String,
        enum: ['transaction', 'payment', 'account', 'security', 'fraud', 'other'],
        required: true,
    },
    subject: { type: String, required: true, trim: true, maxlength: 140 },
    status: {
        type: String,
        enum: ['open', 'awaiting_user', 'in_progress', 'resolved', 'closed'],
        default: 'open',
    },
    priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
    relatedTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
    relatedPaymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
    /** Opened when a fraud-category ticket auto-escalates (§27.3). */
    relatedRiskCaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'RiskCase', default: null },
    messages: [{
        _id: false,
        author: { type: String, enum: ['user', 'agent', 'system'], required: true },
        /** Null for 'system'. Recorded so "who said this" survives a role change. */
        authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        body: { type: String, required: true, maxlength: 4000 },
        at: { type: Date, default: Date.now },
        attachments: { type: [String], default: [] },
    }],
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
}, { timestamps: true });

/** "My tickets". */
supportTicketSchema.index({ userId: 1, status: 1, createdAt: -1 });
/** The agent queue (plan.md §27.1): urgent and oldest first. */
supportTicketSchema.index({ status: 1, priority: -1, createdAt: 1 });

export default mongoose.model('SupportTicket', supportTicketSchema);
