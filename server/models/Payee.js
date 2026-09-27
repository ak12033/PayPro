import mongoose from 'mongoose';

/**
 * A saved recipient (plan.md §10.2.7).
 *
 * Deliberately thin. It holds a *nickname* and a pointer to a real PayPro user;
 * it does not cache the payee's name, email or avatar, because a cached copy
 * goes stale the moment they change it and — worse — would keep showing a
 * closed account's real name after `accountClosureService` pseudonymised it.
 * Everything displayed about a payee is resolved through the `userId` at read
 * time, which is also what makes "recipient no longer exists" a case the UI
 * can actually detect.
 */
const payeeSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    payeeUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    /** The owner's own label for this person. Never shown to the payee. */
    nickname: { type: String, trim: true, maxlength: 40 },
    /** Pinned payees sort first in the picker. */
    favourite: { type: Boolean, default: false },
    lastUsedAt: { type: Date, default: null },
    useCount: { type: Number, default: 0 },
}, { timestamps: true });

/** Saving the same person twice updates the existing row rather than duplicating it. */
payeeSchema.index({ userId: 1, payeeUserId: 1 }, { unique: true });
/** The picker's ordering: favourites first, then most recently used. */
payeeSchema.index({ userId: 1, favourite: -1, lastUsedAt: -1 });

export default mongoose.model('Payee', payeeSchema);
