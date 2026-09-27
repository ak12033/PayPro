import Payee from '../models/Payee.js';
import User from '../models/User.js';

/**
 * Saved payees (plan.md §10.2.7).
 *
 * Nothing here is a security boundary: saving someone as a payee grants no
 * standing authorisation, skips no 2FA, and does not exempt a transfer from the
 * risk gate. It is an address book. That is worth stating because "trusted
 * payee" is a phrase products often use to mean "we stopped checking", and this
 * one does not.
 */

export class PayeeError extends Error {
    constructor(code, message, status = 400) {
        super(message);
        this.name = 'PayeeError';
        this.code = code;
        this.status = status;
    }
}

/**
 * The picker's list. Names are joined from `User` at read time, never cached —
 * see the model comment. A payee whose account has closed is returned with
 * `available: false` so the UI can grey it out rather than silently dropping a
 * row the user explicitly saved.
 */
export const listPayees = async (userId) => {
    const payees = await Payee.find({ userId })
        .sort({ favourite: -1, lastUsedAt: -1, createdAt: -1 })
        .limit(100)
        .populate('payeeUserId', 'firstName lastName email status')
        .lean();

    return payees
        // A payee whose user document is gone entirely has nothing to render.
        .filter((p) => p.payeeUserId)
        .map((p) => ({
            _id: p._id,
            userId: p.payeeUserId._id,
            name: `${p.payeeUserId.firstName} ${p.payeeUserId.lastName || ''}`.trim(),
            email: p.payeeUserId.email,
            nickname: p.nickname || '',
            favourite: p.favourite,
            lastUsedAt: p.lastUsedAt,
            useCount: p.useCount,
            available: p.payeeUserId.status === 'active',
        }));
};

export const savePayee = async (userId, { payeeUserId, nickname = '', favourite = false }) => {
    if (String(payeeUserId) === String(userId)) {
        throw new PayeeError('SELF_PAYEE', 'You cannot save yourself as a payee', 400);
    }

    const target = await User.findById(payeeUserId).select('firstName status').lean();
    if (!target || target.status === 'closed') {
        throw new PayeeError('NOT_FOUND', 'That person is not on PayPro', 404);
    }

    const payee = await Payee.findOneAndUpdate(
        { userId, payeeUserId },
        { $set: { nickname, favourite } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return payee;
};

export const updatePayee = async (userId, payeeId, payload) => {
    const update = {};
    if (payload.nickname !== undefined) update.nickname = payload.nickname;
    if (payload.favourite !== undefined) update.favourite = payload.favourite;

    const payee = await Payee.findOneAndUpdate({ _id: payeeId, userId }, { $set: update }, { new: true });
    if (!payee) throw new PayeeError('NOT_FOUND', 'Payee not found', 404);
    return payee;
};

export const removePayee = async (userId, payeeId) => {
    const payee = await Payee.findOneAndDelete({ _id: payeeId, userId });
    if (!payee) throw new PayeeError('NOT_FOUND', 'Payee not found', 404);
    return payee;
};

/**
 * Record a successful transfer against a saved payee, for the picker's
 * ordering. Best-effort by design: this runs after settlement and its failure
 * must never surface to the user, whose money has already moved.
 */
export const touchPayee = (userId, payeeUserId) =>
    Payee.updateOne(
        { userId, payeeUserId },
        { $set: { lastUsedAt: new Date() }, $inc: { useCount: 1 } }
    ).catch(() => {});

export default { listPayees, savePayee, updatePayee, removePayee, touchPayee, PayeeError };
