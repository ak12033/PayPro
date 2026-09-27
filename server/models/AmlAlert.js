import mongoose from 'mongoose';

/**
 * One transaction-monitoring or screening hit awaiting a human disposition
 * (plan.md §30.3, §0.20.3).
 *
 * **Shadow mode.** Every alert here was raised by a rule that flags and logs and
 * never blocks: no money movement waits on an AmlAlert, and nothing refuses a
 * transfer because one exists. Which obligations, thresholds and lists actually
 * apply is a legal determination (§41.3). Until it is made, the queue exists so
 * the rules can be tuned against real traffic and reviewed by a person.
 *
 * `reportDraft` is an internal draft only. **Filing** a suspicious-transaction
 * report goes through the regulator's own channel (FIU-IND) if PayPro is a
 * reporting entity; nothing in the application submits anything anywhere.
 */
export const AML_RULES = [
    'STRUCTURING',
    'RAPID_IN_OUT',
    'FAN_IN',
    'FAN_OUT',
    'HIGH_VELOCITY',
    'WATCHLIST_MATCH',
    'SHARED_IDENTIFIER',
];

export const AML_DISPOSITIONS = ['false_positive', 'no_action', 'suspicious'];

const amlAlertSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rule: { type: String, enum: AML_RULES, required: true },
    severity: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    /** A reviewer-facing sentence: what was seen, with numbers. */
    detail: { type: String, maxlength: 500, required: true },
    /** What the rule looked at. Ids and paise, never identifiers. */
    evidence: {
        windowHours: Number,
        count: Number,
        totalMinor: Number,
        counterpartyCount: Number,
        transactionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' }],
        watchlistEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'WatchlistEntry' },
        watchlistName: String,
        matchedName: String,
        otherUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    },
    /** Always 'shadow' today. Recorded so a future enforcing mode is distinguishable in history. */
    mode: { type: String, enum: ['shadow'], default: 'shadow' },
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
    disposition: { type: String, enum: [...AML_DISPOSITIONS, null], default: null },
    notes: { type: String, maxlength: 2000, default: '' },
    reportDraft: { type: String, maxlength: 5000, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    /**
     * One alert per user, rule and window (e.g. `FAN_OUT:2026-09-27`). A rule
     * that keeps firing on every transfer that day raises one alert, not forty.
     */
    dedupeKey: { type: String, required: true },
}, { timestamps: true });

amlAlertSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true });
/** The queue: open first, high severity first, oldest first. */
amlAlertSchema.index({ status: 1, severity: 1, createdAt: 1 });
amlAlertSchema.index({ userId: 1, status: 1, createdAt: -1 });

export default mongoose.model('AmlAlert', amlAlertSchema);
