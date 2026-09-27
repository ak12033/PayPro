import User from '../models/User.js';
import Payment from '../models/Payment.js';
import Transaction from '../models/Transaction.js';
import WebhookEvent from '../models/WebhookEvent.js';
import { razorpayInstance } from '../utils/razorpay.js';
import { notifyUser } from './notificationService.js';
import { emitToUser } from '../utils/socket.js';
import { creditFromPayment, debitForRefund } from './ledgerService.js';
import { applyTransition } from './transactionStateService.js';
import { markWebhookProcessed, markWebhookFailed, markWebhookIgnored } from './webhookService.js';
import { sendEmailAlert } from './emailService.js';
import { audit } from './auditService.js';
import { AUDIT } from '../models/AuditLog.js';
import { newBalanceFields } from '../utils/money.js';
import { monitorAfterMovement } from './amlService.js';
import logger from '../utils/logger.js';

/**
 * Settling gateway events against the wallet.
 *
 * Moved out of `paymentController.js` (2026-09-14) so the three callers that
 * need it share one implementation: the browser's `/payments/verify`, the
 * Razorpay webhook, and the admin console's re-settle and webhook-replay
 * actions (plan.md §28.2 "Payments" and "Webhooks"). The behaviour is unchanged
 * — in particular every path here is still a compare-and-set, which is what
 * makes an operator replay safe: replaying an event that already settled is a
 * no-op, not a second credit.
 */

export class SettlementError extends Error {
    constructor(code, message, status = 400) {
        super(message);
        this.name = 'SettlementError';
        this.code = code;
        this.status = status;
    }
}

/**
 * Credit the wallet for a captured order — exactly once.
 *
 * `/payments/verify` (called by the browser) and the Razorpay webhook both
 * settle the same order, and both used to do:
 *
 *     const payment = await Payment.findOne({ orderId });
 *     if (payment.status !== 'captured') {   // <-- read
 *         payment.status = 'captured';
 *         await payment.save();              // <-- write
 *         user.accountBalance += payment.amount;
 *     }
 *
 * When the webhook lands while the browser's verify call is in flight, both
 * reads see 'created', both pass the guard, and the user is credited twice for
 * one payment.
 *
 * The `findOneAndUpdate` below collapses that read-then-write into a single
 * atomic compare-and-set on `walletCredited`. Whichever caller wins the race
 * gets the document back and performs the credit; the loser gets null.
 */
export const settleCapturedOrder = async ({ orderId, paymentId, source }) => {
    const payment = await Payment.findOneAndUpdate(
        { orderId, walletCredited: { $ne: true } },
        { $set: { status: 'captured', paymentId, walletCredited: true } },
        { new: true }
    );

    if (!payment) {
        return { alreadySettled: true };
    }

    try {
        const pending = await Transaction.findOne({
            paymentRef: payment.orderId, category: 'Top Up', status: 'PENDING',
        }).select('_id');

        const { user, transaction } = await creditFromPayment({
            userId: payment.userId,
            amount: payment.amount,
            description: `Added ₹${payment.amount} via Razorpay`,
            paymentRef: payment.orderId,
            pendingTransactionId: pending?._id ?? null
        });

        emitToUser(user._id.toString(), 'deposit_success', {
            ...newBalanceFields(user),
            transaction
        });

        audit(AUDIT.TOPUP_CAPTURED, {
            userId: user._id,
            target: { type: 'Payment', id: orderId },
            metadata: { amount: payment.amount, source }
        });

        notifyUser(
            user._id,
            'Payment',
            'Wallet Top-Up Successful',
            `Your wallet has been credited with ₹${payment.amount}.`,
            { amount: payment.amount, orderId }
        ).catch((err) => logger.error('Top-up notification failed', { error: err.message }));

        sendEmailAlert(user, 'topupSuccess', { amount: payment.amount })
            .catch((err) => logger.error('Top-up email failed', { error: err.message }));

        // Shadow-mode AML (the "in" of rapid in-and-out). Never awaited, never throws.
        monitorAfterMovement(user._id, { trigger: 'topup' });

        return { alreadySettled: false, user, transaction, payment };
    } catch (err) {
        // Release the claim so a webhook retry can settle this order, instead of
        // leaving it permanently flagged as credited with no money delivered.
        await Payment.updateOne({ _id: payment._id }, { $set: { walletCredited: false } });
        logger.error('Failed to credit wallet for order', { orderId, source, err });
        throw err;
    }
};

/**
 * Tell the account holder, once, that a refund left them owing money
 * (plan.md §4.4). A balance going negative with no explanation is exactly the
 * silent failure that section exists to remove; the audit entry is written by
 * `debitForRefund` itself, this is the human-facing half.
 */
export const notifyOverdraft = (user, overdraft) => {
    if (!overdraft?.crossedZero) return;
    const owed = (overdraft.overdraftMinor / 100).toFixed(2);
    notifyUser(
        user._id,
        'Payment',
        'Your balance is below zero',
        `A refund was processed after the money had been spent, so you now owe ₹${owed}. Add money to clear it — you can't send money until you do.`,
        { overdraftMinor: overdraft.overdraftMinor }
    ).catch(() => {});
};

/**
 * Debit the wallet for a processed refund — exactly once, using the same
 * compare-and-set pattern as the capture path.
 */
export const settleRefund = async ({ paymentId, refundId, amount }) => {
    const payment = await Payment.findOneAndUpdate(
        { paymentId, walletCredited: true, walletDebitedOnRefund: { $ne: true } },
        { $set: { status: 'refunded', refundId, walletDebitedOnRefund: true } },
        { new: true }
    );

    if (!payment) return { alreadySettled: true };

    try {
        // Prefer the gateway's authoritative refunded amount when present:
        // a partial refund would otherwise debit the full order value.
        const refundedRupees = Number.isFinite(Number(amount))
            ? Number(amount) / 100
            : payment.amount;

        const { user, transaction, overdraft } = await debitForRefund({
            userId: payment.userId,
            amount: refundedRupees,
            description: `Refund processed for order ${payment.orderId}`,
            paymentRef: payment.orderId
        });

        emitToUser(user._id.toString(), 'wallet_update', {
            ...newBalanceFields(user),
            transaction
        });
        notifyOverdraft(user, overdraft);

        notifyUser(
            user._id,
            'Payment',
            'Refund Processed',
            `A refund of ₹${refundedRupees} has been processed for your top-up.`,
            { amount: refundedRupees, orderId: payment.orderId }
        ).catch(() => {});

        sendEmailAlert(user, 'refundProcessed', { amount: refundedRupees }).catch(() => {});

        /**
         * No `evaluateAfterTransaction` call here, deliberately: this refund
         * reverses a Razorpay top-up, not a category purchase, and its
         * ledger row is written under the 'Refund' category — which is in
         * `EXCLUDED_FROM_BUDGET` — so it was never counted as spend and has
         * nothing to reverse in a budget. If a future change adds refunds
         * for genuine category purchases, that path (not this one) is where
         * a re-evaluation call belongs.
         */

        return { alreadySettled: false, user, transaction };
    } catch (err) {
        await Payment.updateOne({ _id: payment._id }, { $set: { walletDebitedOnRefund: false } });
        throw err;
    }
};

const settleFailedPayment = async (entity) => {
    await Payment.updateOne(
        { orderId: entity.order_id, status: 'created' },
        { $set: { status: 'failed', paymentId: entity.id } }
    );

    const pending = await Transaction.findOne({
        paymentRef: entity.order_id, category: 'Top Up', status: 'PENDING',
    }).select('_id');

    if (pending) {
        const reason = entity.error_description || 'Payment failed';
        // Routed through the shared state machine: SUCCESS has no
        // outgoing transition to FAILED (see ALLOWED_TRANSITIONS), so a
        // failure webhook arriving after the order already captured is
        // refused rather than silently overwriting a settled row —
        // applyTransition throws in that case, swallowed below since
        // there is nothing actionable to do with a stale failure event.
        await applyTransition(pending._id, 'FAILED', { reason, actor: 'system' })
            .then((tx) => Transaction.updateOne({ _id: tx._id }, { $set: { failureReason: reason } }))
            .catch(() => {});
    }

    audit(AUDIT.TOPUP_FAILED, {
        target: { type: 'Payment', id: entity.order_id },
        metadata: { reason: entity.error_description }
    });

    // No user-facing notification existed on this path at all before —
    // a failed top-up was recorded in the audit log and nowhere else.
    if (pending) {
        const failedPayment = await Payment.findOne({ orderId: entity.order_id }).select('userId amount').lean();
        if (failedPayment) {
            const user = await User.findById(failedPayment.userId).select('email preferences').lean();
            notifyUser(
                failedPayment.userId,
                'Payment',
                'Wallet Top-Up Failed',
                `Your top-up of ₹${failedPayment.amount} could not be completed.`,
                { amount: failedPayment.amount, orderId: entity.order_id }
            ).catch(() => {});
            if (user) {
                sendEmailAlert(user, 'topupFailed', {
                    amount: failedPayment.amount, reason: entity.error_description,
                }).catch(() => {});
            }
        }
    }
};

/**
 * Apply one parsed, signature-verified gateway event to the wallet.
 *
 * Returns `'ignored'` for a shape this service does not act on. Throws when
 * settlement fails, so the webhook handler can answer 5xx (Razorpay retries)
 * and a replay can record the failure.
 */
export const processGatewayEvent = async (event, { source = 'webhook' } = {}) => {
    const entity = event?.payload?.payment?.entity ?? event?.payload?.refund?.entity;
    if (!entity) return 'ignored';

    if (event.event === 'payment.captured') {
        await settleCapturedOrder({ orderId: entity.order_id, paymentId: entity.id, source });
    } else if (event.event === 'payment.failed') {
        await settleFailedPayment(entity);
    } else if (event.event === 'refund.processed') {
        await settleRefund({ paymentId: entity.payment_id, refundId: entity.id, amount: entity.amount });
    } else {
        return 'ignored';
    }
    return 'processed';
};

/** Only these can usefully be replayed: the event never finished. */
export const REPLAYABLE_WEBHOOK_STATUSES = ['received', 'failed'];

/**
 * Re-run a stored webhook delivery (plan.md §28.2 "Webhooks — manual replay").
 *
 * The stored payload is what arrived with a valid signature, so it is replayed
 * as-is rather than re-fetched. A `processed` or `ignored` event is refused:
 * replaying it would be a no-op at best, and a button that "does something" to
 * an event that already succeeded teaches operators to press it for no reason.
 */
export const replayWebhookEvent = async (eventId) => {
    const stored = await WebhookEvent.findById(eventId);
    if (!stored) throw new SettlementError('NOT_FOUND', 'Webhook event not found', 404);
    if (!stored.signatureValid) {
        throw new SettlementError('SIGNATURE_INVALID', 'Only events that arrived with a valid signature can be replayed', 409);
    }
    if (!REPLAYABLE_WEBHOOK_STATUSES.includes(stored.status)) {
        throw new SettlementError('NOT_REPLAYABLE', `This event is already ${stored.status}`, 409);
    }

    await WebhookEvent.updateOne({ _id: stored._id }, { $inc: { replayCount: 1 }, $set: { lastReplayedAt: new Date() } });

    try {
        const outcome = await processGatewayEvent(stored.payload, { source: 'admin_replay' });
        if (outcome === 'ignored') await markWebhookIgnored(stored._id);
        else await markWebhookProcessed(stored._id);
        return { outcome, eventType: stored.eventType };
    } catch (err) {
        await markWebhookFailed(stored._id, err.message);
        return { outcome: 'failed', eventType: stored.eventType, error: err.message };
    }
};

/**
 * Force re-settle one top-up (plan.md §28.2 "Payments — force re-settle").
 *
 * For the order a user paid for that never credited — a lost webhook and a
 * closed tab. It asks Razorpay what actually happened rather than trusting the
 * console: only a payment the gateway reports as `captured` is ever credited,
 * and it goes through the same compare-and-set as every other capture, so an
 * order that already credited stays credited once.
 */
export const resettleOrder = async (orderId) => {
    const payment = await Payment.findOne({ orderId }).lean();
    if (!payment) throw new SettlementError('NOT_FOUND', 'Payment not found', 404);
    if (payment.walletCredited) return { alreadySettled: true, status: payment.status };

    const response = await razorpayInstance.orders.fetchPayments(orderId);
    const captured = (response?.items ?? []).find((item) => item.status === 'captured');
    if (!captured) {
        throw new SettlementError('NOT_CAPTURED', 'The gateway has no captured payment for this order, so there is nothing to credit', 409);
    }

    const result = await settleCapturedOrder({ orderId, paymentId: captured.id, source: 'admin_resettle' });
    return { alreadySettled: result.alreadySettled, paymentId: captured.id, amount: payment.amount };
};
