import Transaction from '../models/Transaction.js';
import { LedgerError } from './ledgerService.js';
import { ALLOWED_TRANSITIONS } from '../constants/transactionStatus.js';

/**
 * Pure transition check. Kept separate from the database call below so it can
 * be unit tested without a connection, and so `applyTransition` and any future
 * caller share exactly one definition of "legal".
 */
export const assertTransition = (from, to) => {
    const allowed = ALLOWED_TRANSITIONS[from];
    if (!allowed) {
        throw new LedgerError('INVALID_TRANSITION', `Unknown transaction status "${from}"`, 500);
    }
    if (!allowed.includes(to)) {
        throw new LedgerError(
            'INVALID_TRANSITION',
            `Cannot move a transaction from ${from} to ${to}`,
            409
        );
    }
};

/**
 * Atomically move a transaction to a new status, recording the transition.
 *
 * The `status: {$in: ...}` filter makes this a compare-and-set: if the row has
 * already moved on (a webhook retry racing the browser's verify call, for
 * example), the update matches nothing and `null` comes back rather than a
 * silent double-transition.
 */
export const applyTransition = async (transactionId, to, { reason = '', actor = 'system', session = null } = {}) => {
    const current = await Transaction.findById(transactionId).session(session);
    if (!current) {
        throw new LedgerError('TRANSACTION_NOT_FOUND', 'Transaction not found', 404);
    }

    assertTransition(current.status, to);

    const updated = await Transaction.findOneAndUpdate(
        { _id: transactionId, status: current.status },
        {
            $set: { status: to },
            $push: { statusHistory: { from: current.status, to, at: new Date(), reason, actor } },
        },
        { new: true, session }
    );

    if (!updated) {
        throw new LedgerError(
            'INVALID_TRANSITION',
            'This transaction changed status concurrently; please retry.',
            409
        );
    }

    return updated;
};
