import User from '../models/User.js';
import Bill from '../models/Bill.js';
import { holdFunds, advanceHold, releaseHold } from './ledgerService.js';
import { checkTransferLimits } from './limitService.js';
import { markPaid } from './billService.js';
import { evaluateAfterTransaction } from './budgetService.js';
import { monitorAfterMovement } from './amlService.js';
import { getBillProvider } from './providers/billProvider.js';
import { notifyUser } from './notificationService.js';
import { audit } from './auditService.js';
import { AUDIT } from '../models/AuditLog.js';
import { emitToUser } from '../utils/socket.js';
import { fromPaise, newBalanceFields, balanceMinorOf } from '../utils/money.js';
import { DomainError } from '../utils/domainError.js';
import { TX_SOURCE, TX_STATUS } from '../constants/transactionStatus.js';
import logger from '../utils/logger.js';

/**
 * Paying a bill through a provider (plan.md §19.3) — kept apart from
 * `billService`, which is the reminder tracker and must stay unable to move
 * money (context.md §5.14). This module is the only one that pays a biller, and
 * it does so through `providers/billProvider.js`, which today is either the
 * demo biller or nothing at all.
 *
 * The money path is the same hold pattern as a withdrawal:
 *   1. `holdFunds` debits the wallet and writes a PENDING `source:'bill'` row;
 *   2. the provider is asked to pay;
 *   3. SUCCESS → the row becomes SUCCESS; FAILED or an error → `releaseHold`
 *      returns the money and the row becomes FAILED. A provider that answers
 *      PENDING leaves the hold in place for a status check.
 * The debit happens before the provider call so the wallet can never pay a
 * biller with money it has already spent elsewhere.
 */

export const getStatus = () => {
    const provider = getBillProvider();
    return { enabled: provider.mode !== 'unconfigured', mode: provider.mode };
};

export const searchBillers = () => getBillProvider().searchBillers();

export const fetchBill = ({ billerId, customerRef }) => getBillProvider().fetchBill({ billerId, customerRef });

export const payBill = async (userId, { billerId, customerRef, billId = null, idempotencyKey }, { req } = {}) => {
    const provider = getBillProvider();
    // Fetch again rather than trusting an amount from the browser: the biller's
    // figure is the amount due, not whatever the page last showed.
    const bill = await provider.fetchBill({ billerId, customerRef });
    const amount = fromPaise(bill.amountMinor);

    const user = await User.findById(userId).select('kycTier balanceMinor email firstName preferences').lean();
    if (!user) throw new DomainError('NOT_FOUND', 'User not found', 404);
    if (balanceMinorOf(user) < bill.amountMinor) throw new DomainError('INSUFFICIENT_FUNDS', 'Insufficient balance', 400);
    await checkTransferLimits({ userId, tier: user.kycTier, amount, noun: 'bill payment' });

    let reminder = null;
    if (billId) {
        reminder = await Bill.findOne({ _id: billId, userId, archivedAt: null }).select('_id').lean();
        if (!reminder) throw new DomainError('NOT_FOUND', 'Bill reminder not found', 404);
    }

    const demo = provider.mode === 'demo';
    const held = await holdFunds({
        userId,
        amount,
        source: TX_SOURCE.BILL,
        category: bill.category || 'Bills',
        icon: 'Receipt',
        description: `${demo ? '[Demo] ' : ''}${bill.billerName} bill ${bill.billNumber}`,
        counterparty: { kind: 'merchant', name: bill.billerName },
    });

    let outcome;
    try {
        outcome = await provider.payBill({ billerId, customerRef, amountMinor: bill.amountMinor, idempotencyKey });
    } catch (err) {
        logger.error('Bill provider payment call failed; returning held funds', { err, billerId });
        outcome = { status: 'FAILED', failureReason: 'The biller could not be reached.' };
    }

    let transaction;
    let balanceUser = held.user;
    if (outcome.status === 'SUCCESS') {
        transaction = await advanceHold({
            transactionId: held.transaction._id,
            from: TX_STATUS.PENDING,
            to: TX_STATUS.SUCCESS,
            reason: `Biller confirmed (${outcome.providerRef})`,
            set: { paymentRef: `bill:${outcome.providerRef}` },
        });
    } else if (outcome.status === 'PENDING') {
        transaction = held.transaction;
    } else {
        const released = await releaseHold({
            transactionId: held.transaction._id,
            to: TX_STATUS.FAILED,
            reason: outcome.failureReason || 'Declined by the biller',
            failureReason: outcome.failureReason || 'Declined by the biller',
        });
        transaction = released.transaction;
        balanceUser = released.user;
    }

    const succeeded = outcome.status === 'SUCCESS';
    audit(succeeded ? AUDIT.BILL_PAYMENT_SUCCEEDED : AUDIT.BILL_PAYMENT_FAILED, {
        userId, req, outcome: succeeded ? 'success' : 'failure',
        target: { type: 'Transaction', id: String(transaction._id) },
        metadata: { billerId, amount, providerRef: outcome.providerRef ?? null, mode: provider.mode, status: outcome.status },
    });

    emitToUser(String(userId), 'wallet_update', { ...newBalanceFields(balanceUser), transaction });

    if (succeeded) {
        if (reminder) {
            await markPaid(userId, reminder._id, { transactionId: transaction._id })
                .catch((err) => logger.warn('Could not mark the bill reminder paid', { error: err.message }));
        }
        Promise.all([
            notifyUser(userId, 'Payment', `${demo ? '[Demo] ' : ''}Bill paid`, `₹${amount} paid to ${bill.billerName}.`, { transactionId: String(transaction._id) }),
            evaluateAfterTransaction(userId, transaction),
            monitorAfterMovement(userId, { trigger: 'bill_payment' }),
        ]).catch(() => {});
    }

    return {
        status: outcome.status,
        mode: provider.mode,
        failureReason: succeeded ? null : outcome.failureReason ?? null,
        transaction,
        ...newBalanceFields(balanceUser),
    };
};

export default { getStatus, searchBillers, fetchBill, payBill };
