import User from '../models/User.js';
import Payment from '../models/Payment.js';
import config from '../config/env.js';
import { razorpayInstance, verifyRazorpaySignature, verifyWebhookSignature } from '../utils/razorpay.js';
import crypto from 'crypto';
import { emitToUser } from '../utils/socket.js';
import { debitForRefund, createLedgerEntry, LedgerError } from '../services/ledgerService.js';
import { hashWebhookBody, recordWebhookEvent, markWebhookProcessed, markWebhookFailed, markWebhookIgnored } from '../services/webhookService.js';
import { settleCapturedOrder, notifyOverdraft, processGatewayEvent } from '../services/paymentSettlementService.js';
import { checkBalanceCeiling } from '../services/limitService.js';
import { sendEmailAlert } from '../services/emailService.js';
import { parseAmount, toPaise, newBalanceFields, balanceMinorOf } from '../utils/money.js';
import { asString, asInt } from '../utils/sanitize.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { audit } from '../services/auditService.js';
import { AUDIT } from '../models/AuditLog.js';
import logger from '../utils/logger.js';
import { TX_STATUS, TX_SOURCE, TX_SETTLEMENT } from '../constants/transactionStatus.js';

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

    const account = await User.findById(req.user.id).select('accountBalance balanceMinor kycTier');
    if (!account) return res.status(404).json({ message: 'User not found' });

    try {
        checkBalanceCeiling({ tier: account.kycTier, currentBalanceMinor: balanceMinorOf(account), amount });
    } catch (err) {
        if (err instanceof LedgerError) {
            return res.status(err.status).json({ message: err.message });
        }
        throw err;
    }

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

    /**
     * A PENDING ledger row from the moment checkout starts.
     *
     * Previously a top-up was invisible in Activity until it captured — if a
     * user closed the tab mid-payment, or a webhook was delayed, there was no
     * record at all of the attempt. This row never touches `accountBalance`
     * (nothing here calls creditWallet); `creditFromPayment` transitions it to
     * SUCCESS on capture, and the webhook's `payment.failed` handler below
     * transitions it to FAILED.
     */
    await createLedgerEntry({
        userId: req.user.id,
        description: `Adding ₹${amount} via Razorpay`,
        amount,
        type: 'Credit',
        category: 'Top Up',
        icon: 'Wallet',
        paymentRef: order.id,
        source: TX_SOURCE.TOPUP,
        settlement: TX_SETTLEMENT.SETTLED,
        status: TX_STATUS.PENDING,
        categorySource: 'system',
    });

    res.status(200).json({
        success: true,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency
    });
});

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
        const current = await User.findById(req.user.id).select('accountBalance balanceMinor');
        return res.status(200).json({
            success: true,
            message: 'Payment already verified',
            ...newBalanceFields(current)
        });
    }

    res.status(200).json({
        success: true,
        message: 'Payment verified and balance updated',
        ...newBalanceFields(result.user)
    });
});

export const handleWebhook = asyncHandler(async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    const secret = config.RAZORPAY_WEBHOOK_SECRET;

    if (!secret) {
        logger.error('RAZORPAY_WEBHOOK_SECRET is not configured; rejecting webhook');
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

    /**
     * Durable record + dedupe.
     *
     * The settlement paths below are already idempotent (compare-and-set on
     * `walletCredited`/`walletDebitedOnRefund`), so a duplicate delivery was
     * always *safe* — it just wasn't *visible*. This records every delivery
     * so an outage or a stuck queue on the gateway side shows up as a gap in
     * this collection rather than as silence, and gives an admin something
     * concrete to replay. See services/webhookService.js for why the hash of
     * the raw body, not a payload field, is the dedupe key.
     */
    const { duplicate, event: webhookEvent } = await recordWebhookEvent({
        eventId: hashWebhookBody(req.body),
        eventType: event?.event,
        payload: event,
        signatureValid: true,
    });

    if (duplicate) {
        audit(AUDIT.WEBHOOK_DUPLICATE, { outcome: 'success', req, metadata: { eventType: event?.event } });
        return res.status(200).json({ status: 'duplicate' });
    }

    audit(AUDIT.WEBHOOK_RECEIVED, { outcome: 'success', req, metadata: { eventType: event?.event } });

    try {
        const outcome = await processGatewayEvent(event, { source: 'webhook' });
        if (outcome === 'ignored') {
            // Acknowledge unknown shapes so Razorpay stops retrying them.
            await markWebhookIgnored(webhookEvent._id);
            return res.status(200).json({ status: 'ignored' });
        }
    } catch (err) {
        // Return 5xx so Razorpay retries. The atomic guards in
        // paymentSettlementService make the retry safe: a replayed event is a no-op.
        logger.error('Webhook processing error', { err });
        await markWebhookFailed(webhookEvent._id, err.message);
        return res.status(500).json({ status: 'error' });
    }

    await markWebhookProcessed(webhookEvent._id);
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

        const { user, transaction, overdraft } = await debitForRefund({
            userId: req.user.id,
            amount: payment.amount,
            description: `Refunded ₹${payment.amount}`,
            paymentRef: payment.orderId
        });
        notifyOverdraft(user, overdraft);

        await Payment.updateOne(
            { _id: payment._id },
            { $set: { status: 'refunded', refundId: refund.id } }
        );

        emitToUser(user._id.toString(), 'wallet_update', {
            ...newBalanceFields(user),
            transaction
        });

        audit(AUDIT.REFUND_ISSUED, {
            userId: req.user.id, req,
            target: { type: 'Payment', id: payment.orderId },
            metadata: { amount: payment.amount, refundId: refund.id }
        });

        sendEmailAlert(user, 'refundProcessed', { amount: payment.amount }).catch(() => {});

        res.status(200).json({
            success: true,
            message: 'Refund initiated successfully',
            ...newBalanceFields(user)
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
