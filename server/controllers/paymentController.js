import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Payment from '../models/Payment.js';
import config from '../config/env.js';
import { generateInvoiceId } from '../utils/generateInvoiceId.js';
import { razorpayInstance, verifyRazorpaySignature, verifyWebhookSignature } from '../utils/razorpay.js';
import crypto from 'crypto';
import { notifyUser } from '../services/notificationService.js';
import { emitToUser } from '../utils/socket.js';

export const createOrder = async (req, res) => {
    try {
        const { amount } = req.body;
        const numericAmount = Number(amount);

        if (numericAmount <= 0) {
            return res.status(400).json({ message: 'Amount must be positive' });
        }

        const receipt = `rcpt_${crypto.randomBytes(8).toString('hex')}`;

        const options = {
            amount: numericAmount * 100, // amount in smallest currency unit (paise)
            currency: 'INR',
            receipt: receipt,
        };

        const order = await razorpayInstance.orders.create(options);

        // Save payment record in DB with created status
        await Payment.create({
            userId: req.user.id,
            orderId: order.id,
            amount: numericAmount,
            currency: order.currency,
            status: 'created',
            receipt: receipt
        });

        res.status(200).json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency
        });

    } catch (err) {
        console.error('Create Order Error:', err);
        res.status(500).json({ message: err.message });
    }
};

export const verifyPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        const isSignatureValid = verifyRazorpaySignature(
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        );

        if (!isSignatureValid) {
            return res.status(400).json({ message: 'Invalid signature' });
        }

        // Find the payment
        const payment = await Payment.findOne({ orderId: razorpay_order_id });
        if (!payment) {
            return res.status(404).json({ message: 'Payment record not found' });
        }

        // Idempotency check
        if (payment.status === 'captured') {
            return res.status(200).json({ message: 'Payment already verified', success: true });
        }

        // Update payment status
        payment.status = 'captured';
        payment.paymentId = razorpay_payment_id;
        await payment.save();

        // Credit user balance
        const user = await User.findById(payment.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.accountBalance += payment.amount;
        await user.save();

        const invoiceId = generateInvoiceId();

        // Create a transaction log
        const transaction = await Transaction.create({
            userId: user._id,
            description: `Added ₹${payment.amount} via Razorpay`,
            amount: payment.amount,
            type: 'Credit',
            category: 'Top Up',
            icon: 'Wallet',
            invoiceId,
        });

        emitToUser(user._id.toString(), 'deposit_success', {
            newBalance: user.accountBalance,
            transaction
        });

        // Trigger Notification
        await notifyUser(
            user._id,
            'Payment',
            'Wallet Top-Up Successful',
            `Your wallet has been credited with ₹${payment.amount}.`,
            { amount: payment.amount, orderId: razorpay_order_id }
        );

        res.status(200).json({ success: true, message: 'Payment verified and balance updated', newBalance: user.accountBalance });
    } catch (err) {
        console.error('Verify Payment Error:', err);
        res.status(500).json({ message: err.message });
    }
};

export const handleWebhook = async (req, res) => {
    try {
        const signature = req.headers['x-razorpay-signature'];
        const secret = config.RAZORPAY_WEBHOOK_SECRET;

        // Verify webhook signature (using raw body if necessary, but express.json handles this via stringification in utils if simple)
        // For production, it's safer to use req.rawBody or raw buffer. Express might parse it already.
        // Assuming verifyWebhookSignature handles it correctly for now.
        const isValid = verifyWebhookSignature(req.body, signature, secret);

        if (!isValid) {
            return res.status(400).send('Invalid webhook signature');
        }

        const event = req.body.event;
        const paymentEntity = req.body.payload.payment.entity;

        if (event === 'payment.captured') {
            const orderId = paymentEntity.order_id;
            
            const payment = await Payment.findOne({ orderId: orderId });
            if (payment && payment.status !== 'captured') {
                payment.status = 'captured';
                payment.paymentId = paymentEntity.id;
                await payment.save();

                const user = await User.findById(payment.userId);
                if (user) {
                    user.accountBalance += payment.amount;
                    await user.save();

                    const transaction = await Transaction.create({
                        userId: user._id,
                        description: `Added ₹${payment.amount} via Razorpay Webhook`,
                        amount: payment.amount,
                        type: 'Credit',
                        category: 'Top Up',
                        icon: 'Wallet',
                        invoiceId: generateInvoiceId(),
                    });

                    emitToUser(user._id.toString(), 'deposit_success', {
                        newBalance: user.accountBalance,
                        transaction
                    });

                    // Trigger Notification
                    await notifyUser(
                        user._id,
                        'Payment',
                        'Wallet Top-Up Successful',
                        `Your wallet has been credited with ₹${payment.amount}.`,
                        { amount: payment.amount, orderId: orderId }
                    );
                }
            }
        } else if (event === 'payment.failed') {
            const orderId = paymentEntity.order_id;
            const payment = await Payment.findOne({ orderId: orderId });
            if (payment && payment.status === 'created') {
                payment.status = 'failed';
                payment.paymentId = paymentEntity.id;
                await payment.save();
            }
        } else if (event === 'refund.processed') {
            const paymentId = paymentEntity.payment_id;
            const refundId = paymentEntity.id;
            const payment = await Payment.findOne({ paymentId: paymentId });
            if (payment && payment.status === 'captured') {
                payment.status = 'refunded';
                payment.refundId = refundId;
                await payment.save();
                
                // Deduct balance
                const user = await User.findById(payment.userId);
                if (user) {
                    user.accountBalance -= payment.amount;
                    await user.save();

                    const transaction = await Transaction.create({
                        userId: user._id,
                        description: `Refund processed for Razorpay payment`,
                        amount: payment.amount,
                        type: 'Debit',
                        category: 'Refund',
                        icon: 'RefreshCcw',
                        invoiceId: generateInvoiceId(),
                    });

                    emitToUser(user._id.toString(), 'wallet_update', {
                        newBalance: user.accountBalance,
                        transaction
                    });
                }
            }
        }

        res.status(200).json({ status: 'ok' });
    } catch (err) {
        console.error('Webhook Error:', err);
        res.status(500).json({ message: err.message });
    }
};

export const refundPayment = async (req, res) => {
    try {
        const { paymentId } = req.body;

        const payment = await Payment.findOne({ paymentId, userId: req.user.id, status: 'captured' });
        if (!payment) {
            return res.status(404).json({ message: 'Valid payment not found or already refunded' });
        }

        const user = await User.findById(req.user.id);
        if (user.accountBalance < payment.amount) {
            return res.status(400).json({ message: 'Insufficient balance to process refund' });
        }

        // Issue refund via Razorpay
        const refund = await razorpayInstance.payments.refund(paymentId, {
            amount: payment.amount * 100
        });

        // The status update and balance deduction will ideally be handled by webhook, 
        // but we can also synchronously do it here for immediate feedback.
        payment.status = 'refunded';
        payment.refundId = refund.id;
        await payment.save();

        user.accountBalance -= payment.amount;
        await user.save();

        const transaction = await Transaction.create({
            userId: user._id,
            description: `Refunded ₹${payment.amount}`,
            amount: payment.amount,
            type: 'Debit',
            category: 'Refund',
            icon: 'RefreshCcw',
            invoiceId: generateInvoiceId(),
        });

        emitToUser(user._id.toString(), 'wallet_update', {
            newBalance: user.accountBalance,
            transaction
        });

        res.status(200).json({ success: true, message: 'Refund initiated successfully', newBalance: user.accountBalance });
    } catch (err) {
        console.error('Refund Error:', err);
        res.status(500).json({ message: err.message });
    }
};

export const getPaymentHistory = async (req, res) => {
    try {
        const payments = await Payment.find({ userId: req.user.id }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, payments });
    } catch (err) {
        console.error('Get Payment History Error:', err);
        res.status(500).json({ message: err.message });
    }
};
