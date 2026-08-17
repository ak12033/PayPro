import User from '../models/User.js';
import Payment from '../models/Payment.js';
import config from '../config/env.js';
import { razorpayInstance, verifyRazorpaySignature, verifyWebhookSignature } from '../utils/razorpay.js';
import crypto from 'crypto';
import { notifyUser } from '../services/notificationService.js';
import { emitToUser } from '../utils/socket.js';
import { creditFromPayment, debitForRefund, LedgerError } from '../services/ledgerService.js';
import { parseAmount, toPaise } from '../utils/money.js';
import { asString, asInt } from '../utils/sanitize.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { audit } from '../services/auditService.js';
import { AUDIT } from '../models/AuditLog.js';
import logger from '../utils/logger.js';

export const createOrder = asyncHandler(async (req, res) => {
    /**
     * The old validation was `if (Number(amount) <= 0) reject`. For a
     * non-numeric body that evaluates `NaN <= 0`, which is **false**, so
     * garbage sailed through and `NaN * 100` was sent to Razorpay.
     */
    const parsed = parseAmount(req.body?.amount);
    if (!parsed.ok) {
        return res.status(400).json({ message: parsed.error });
    }
    const amount = parsed.value;

    const receipt = `rcpt_${crypto.randomBytes(8).toString('hex')}`;

    const order = await razorpayInstance.orders.create({
        // toPaise() rounds, so 1000.5 no longer becomes 100050.00000000001,
        // which Razorpay rejects as a non-integer.
        amount: toPaise(amount),
        currency: 'INR',
        receipt,
    });

    await Payment.create({
        userId: req.user.id,
        orderId: order.id,
        amount,
        currency: order.currency,
        status: 'created',
        receipt
    });

    res.status(200).json({
        success: true,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency
    });
});

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
const settleCapturedOrder = async ({ orderId, paymentId, source }) => {
    const payment = await Payment.findOneAndUpdate(
        { orderId, walletCredited: { $ne: true } },
        { $set: { status: 'captured', paymentId, walletCredited: true } },
        { new: true }
    );

    if (!payment) {
        return { alreadySettled: true };
    }

    try {
        const { user, transaction } = await creditFromPayment({
            userId: payment.userId,
            amount: payment.amount,
            description: `Added ₹${payment.amount} via Razorpay`,
            paymentRef: payment.orderId
        });

        emitToUser(user._id.toString(), 'deposit_success', {
            newBalance: user.accountBalance,
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
        ).catch((err) => console.error('Top-up notification failed:', err.message));

        return { alreadySettled: false, user, transaction, payment };
    } catch (err) {
        // Release the claim so a webhook retry can settle this order, instead of
        // leaving it permanently flagged as credited with no money delivered.
        await Payment.updateOne({ _id: payment._id }, { $set: { walletCredited: false } });
        console.error(`Failed to credit wallet for order ${orderId} (${source}):`, err.message);
        throw err;
    }
};

/**
 * Debit the wallet for a processed refund — exactly once, using the same
 * compare-and-set pattern as the capture path.
 */
const settleRefund = async ({ paymentId, refundId, amount }) => {
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

        const { user, transaction } = await debitForRefund({
            userId: payment.userId,
            amount: refundedRupees,
            description: `Refund processed for order ${payment.orderId}`,
            paymentRef: payment.orderId
        });

        emitToUser(user._id.toString(), 'wallet_update', {
            newBalance: user.accountBalance,
            transaction
        });

        notifyUser(
            user._id,
            'Payment',
            'Refund Processed',
            `A refund of ₹${refundedRupees} has been processed for your top-up.`,
            { amount: refundedRupees, orderId: payment.orderId }
        ).catch(() => {});

        return { alreadySettled: false, user, transaction };
    } catch (err) {
        await Payment.updateOne({ _id: payment._id }, { $set: { walletDebitedOnRefund: false } });
        throw err;
    }
};

export const verifyPayment = asyncHandler(async (req, res) => {
    const orderId = asString(req.body?.razorpay_order_id, { maxLength: 120 });
    const paymentId = asString(req.body?.razorpay_payment_id, { maxLength: 120 });
    const signature = asString(req.body?.razorpay_signature, { maxLength: 256 });

    if (!orderId || !paymentId || !signature) {
        return res.status(400).json({ message: 'Missing payment verification fields' });
    }

    if (!verifyRazorpaySignature(orderId, paymentId, signature)) {
        return res.status(400).json({ message: 'Invalid signature' });
    }

    // Ownership check: without it, any authenticated user who observed another
    // user's (order_id, payment_id, signature) triple could replay it.
    const owned = await Payment.findOne({ orderId, userId: req.user.id }).lean();
    if (!owned) {
        return res.status(404).json({ message: 'Payment record not found' });
    }

    const result = await settleCapturedOrder({ orderId, paymentId, source: 'verify' });

    if (result.alreadySettled) {
        const current = await User.findById(req.user.id).select('accountBalance');
        return res.status(200).json({
            success: true,
            message: 'Payment already verified',
            newBalance: current?.accountBalance
        });
    }

    res.status(200).json({
        success: true,
        message: 'Payment verified and balance updated',
        newBalance: result.user.accountBalance
    });
});

export const handleWebhook = asyncHandler(async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    const secret = config.RAZORPAY_WEBHOOK_SECRET;

    if (!secret) {
        console.error('RAZORPAY_WEBHOOK_SECRET is not configured; rejecting webhook.');
        return res.status(500).send('Webhook not configured');
    }

    /**
     * `req.body` here is a raw Buffer — see the `express.raw()` mount for this
     * route in server.js.
     *
     * The previous implementation ran the signature HMAC over
     * `JSON.stringify(req.body)` *after* express.json() had already parsed it.
     * Re-serialising a parsed object does not reproduce Razorpay's original
     * bytes (key order, whitespace, unicode escaping and number formatting all
     * differ), so the computed HMAC essentially never matched: every genuine
     * webhook was rejected with a 400. Top-ups only ever settled when the
     * browser stayed open long enough to complete the /verify call, and any
     * payment where the user closed the tab was silently lost.
     */
    if (!verifyWebhookSignature(req.body, signature, secret)) {
        // A rejected webhook is a genuine security signal: either a
        // misconfigured secret or someone forging capture events.
        audit(AUDIT.WEBHOOK_REJECTED, { outcome: 'failure', req, metadata: { reason: 'bad_signature' } });
        logger.warn('Rejected Razorpay webhook with invalid signature');
        return res.status(400).send('Invalid webhook signature');
    }

    let event;
    try {
        event = JSON.parse(req.body.toString('utf8'));
    } catch {
        return res.status(400).send('Malformed webhook payload');
    }

    const entity = event?.payload?.payment?.entity ?? event?.payload?.refund?.entity;
    if (!entity) {
        // Acknowledge unknown shapes so Razorpay stops retrying them.
        return res.status(200).json({ status: 'ignored' });
    }

    try {
        if (event.event === 'payment.captured') {
            await settleCapturedOrder({
                orderId: entity.order_id,
                paymentId: entity.id,
                source: 'webhook'
            });
        } else if (event.event === 'payment.failed') {
            await Payment.updateOne(
                { orderId: entity.order_id, status: 'created' },
                { $set: { status: 'failed', paymentId: entity.id } }
            );
        } else if (event.event === 'refund.processed') {
            await settleRefund({
                paymentId: entity.payment_id,
                refundId: entity.id,
                amount: entity.amount
            });
        }
    } catch (err) {
        // Return 5xx so Razorpay retries. The atomic guards above make the
        // retry safe: a replayed event is a no-op.
        console.error('Webhook processing error:', err);
        return res.status(500).json({ status: 'error' });
    }

    res.status(200).json({ status: 'ok' });
});

export const refundPayment = asyncHandler(async (req, res) => {
    const paymentId = asString(req.body?.paymentId, { maxLength: 120 });
    if (!paymentId) {
        return res.status(400).json({ message: 'paymentId is required' });
    }

    /**
     * Claim the refund atomically *before* calling Razorpay.
     *
     * Previously the handler read the payment, called the gateway, and only
     * then wrote the status — so two concurrent requests both saw
     * status 'captured', both issued a real refund at Razorpay, and the wallet
     * was debited twice for one payment.
     */
    const payment = await Payment.findOneAndUpdate(
        {
            paymentId,
            userId: req.user.id,
            status: 'captured',
            walletDebitedOnRefund: { $ne: true }
        },
        { $set: { walletDebitedOnRefund: true } },
        { new: true }
    );

    if (!payment) {
        return res.status(404).json({ message: 'Valid payment not found or already refunded' });
    }

    try {
        const refund = await razorpayInstance.payments.refund(paymentId, {
            amount: toPaise(payment.amount)
        });

        const { user, transaction } = await debitForRefund({
            userId: req.user.id,
            amount: payment.amount,
            description: `Refunded ₹${payment.amount}`,
            paymentRef: payment.orderId
        });

        await Payment.updateOne(
            { _id: payment._id },
            { $set: { status: 'refunded', refundId: refund.id } }
        );

        emitToUser(user._id.toString(), 'wallet_update', {
            newBalance: user.accountBalance,
            transaction
        });

        audit(AUDIT.REFUND_ISSUED, {
            userId: req.user.id, req,
            target: { type: 'Payment', id: payment.orderId },
            metadata: { amount: payment.amount, refundId: refund.id }
        });

        res.status(200).json({
            success: true,
            message: 'Refund initiated successfully',
            newBalance: user.accountBalance
        });
    } catch (err) {
        // Release the claim so the user can retry a refund that never happened.
        await Payment.updateOne({ _id: payment._id }, { $set: { walletDebitedOnRefund: false } });
        if (err instanceof LedgerError) {
            return res.status(err.status).json({ message: err.message });
        }
        throw err;
    }
});

export const getPaymentHistory = asyncHandler(async (req, res) => {
    const page = asInt(req.query.page, { min: 1, max: 100000, fallback: 1 });
    const limit = asInt(req.query.limit, { min: 1, max: 100, fallback: 20 });

    const [payments, total] = await Promise.all([
        Payment.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        Payment.countDocuments({ userId: req.user.id })
    ]);

    res.status(200).json({
        success: true,
        payments,
        total,
        currentPage: page,
        totalPages: Math.max(1, Math.ceil(total / limit))
    });
});
