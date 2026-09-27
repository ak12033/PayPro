import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        /**
         * 'Account' (Phase 5): identity-verification and bank-account outcomes.
         * Not mutable — see CATEGORY_BY_TYPE in services/notificationPolicy.js.
         */
        enum: ['Payment', 'Security', 'Transfer', 'Reminder', 'System', 'Budget', 'Goal', 'Bill', 'Insight', 'Support', 'Account'],
        required: true
    },
    title: {
        type: String,
        required: true,
        maxlength: 140
    },
    message: {
        type: String,
        required: true,
        maxlength: 1000
    },
    isRead: {
        type: Boolean,
        default: false
    },
    /** Free-form grouping (e.g. 'budget', 'security') — not enforced yet, reserved for future per-category preferences (plan.md §26.2.4, out of Phase 3 scope). No `default`, deliberately: see `dedupeKey` below. */
    category: { type: String },
    /**
     * De-duplication key (plan.md §26.2.2). A repeated real-world event (the
     * same budget threshold, the same day's reconciliation alert) reuses the
     * same key on purpose — the unique+sparse index below is what turns a
     * second `notifyUser` call into a no-op instead of a second notification.
     *
     * No `default: null` here on purpose. A sparse index only excludes a
     * document whose field is entirely *absent* — a field explicitly set to
     * `null` still counts as present for indexing purposes, so a schema
     * default of `null` would make every notification without a real
     * dedupeKey collide with every other one on this unique index. Leaving
     * the field genuinely unset (`undefined`) is what keeps most
     * notifications out of the index, same as existing rows before this
     * field existed — no backfill needed either way.
     */
    dedupeKey: { type: String },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, { timestamps: true });

// Notification centre: newest first, per user.
notificationSchema.index({ userId: 1, createdAt: -1 });
// Unread badge count.
notificationSchema.index({ userId: 1, isRead: 1 });
/**
 * De-duplication: the same event, for the same user, is recorded at most once.
 *
 * A `sparse` index on a *compound* key does not do what it does on a single
 * field: Mongo only excludes a document from a compound sparse index when
 * **every** indexed field is missing, and `userId` here is always present —
 * so `sparse` alone would still index (and collide) every notification that
 * has no `dedupeKey` at all. A `partialFilterExpression` says precisely which
 * documents participate instead, which is the actual requirement.
 */
notificationSchema.index(
    { userId: 1, dedupeKey: 1 },
    { unique: true, partialFilterExpression: { dedupeKey: { $exists: true } } }
);

export default mongoose.model('Notification', notificationSchema);
