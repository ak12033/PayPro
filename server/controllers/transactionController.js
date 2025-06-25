import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import categorizeTransactionWithLLM from '../utils/categorization.js';
import { generateInvoiceId } from '../utils/generateInvoiceId.js';
import categorizeIconWithLLM from '../utils/icon.js';
import Otp from '../models/Otp.js';
import sendOtp from '../utils/sendOtp.js';
import bcrypt from 'bcryptjs';

export const addTransaction = async (req, res) => {
    let category = 'Others';
    let icon = 'CircleDollarSign';
    try {
        const { description, amount } = req.body;
        const numericAmount = Number(amount);

        if (isNaN(numericAmount) || numericAmount <= 0) {
            return res.status(400).json({ message: 'Amount must be a positive number' });
        }

        // Get user
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check for sufficient balance
        if (user.accountBalance < numericAmount) {
            return res.status(400).json({ message: 'Insufficient balance' });
        }

        // AI Categorization via Gemini
        category = await categorizeTransactionWithLLM(description);
        icon = await categorizeIconWithLLM(description);

        // Create transaction
        const transaction = await Transaction.create({
            userId: req.user.id,
            description,
            amount: numericAmount,
            type: 'Debit',
            category,
            icon,
            invoiceId: generateInvoiceId(),
        });

        // Deduct amount from user balance
        user.accountBalance -= numericAmount;
        await user.save();

        res.status(201).json({ message: 'Transaction added successfully', transaction });
    } catch (err) {
        console.error('Add Transaction Error:', err);
        res.status(500).json({ message: 'Failed to add transaction' });
    }
};

export const getPaginatedTransactions = async (req, res) => {
    try {
        const { page = 1, limit = 5, filter = 'All' } = req.query;
        const query = { userId: req.user.id };

        // Add filter logic
        if (filter === 'Transfer') {
            query.type = 'Debit';
            query.category = 'Transfer';
        } else if (filter === 'Received') {
            query.type = 'Credit';
            query.category = 'Transfer';
        } else if (filter === 'Payment') {
            query.type = 'Debit';
            query.category = { $ne: 'Transfer' };
        }

        const total = await Transaction.countDocuments(query);
        const transactions = await Transaction.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit));

        res.status(200).json({
            transactions,
            total,
            currentPage: Number(page),
            totalPages: Math.ceil(total / limit),
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

export const sendMoney = async (req, res) => {
    try {
        const { recipientId, amount, skip2FA } = req.body;
        const numericAmount = Number(amount);

        if (isNaN(numericAmount) || numericAmount <= 0)
            return res.status(400).json({ message: 'Amount must be positive' });

        const sender = await User.findById(req.user.id);
        const recipient = await User.findById(recipientId);

        if (!recipient)
            return res.status(404).json({ message: 'Recipient not found' });

        if (sender.accountBalance < numericAmount)
            return res.status(400).json({ message: 'Insufficient balance' });

        // Check number of transactions today
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const transferCount = await Transaction.countDocuments({
            userId: sender._id,
            recipientId: recipient._id,
            type: 'Debit',
            category: 'Transfer',
            createdAt: { $gte: startOfDay },
        });

        // If 5+ transfers, trigger 2FA unless skip2FA is true
        if (transferCount >= 5 && !skip2FA) {
            const otp = Math.floor(100000 + Math.random() * 900000).toString();

            const salt = await bcrypt.genSalt(10);
            const otpHash = await bcrypt.hash(otp, salt);

            await Otp.create({
                email: sender.email,
                otpHash,
                expiry: Date.now() + 10 * 60 * 1000 // 10 min expiry
            });

            await sendOtp(sender.email, otp);

            return res.status(403).json({
                message: `2FA Required: An OTP has been sent to ${sender.email}`,
                require2FA: true,
                email: sender.email,
            });
        }

        // Proceed with transfer
        const senderTx = await Transaction.create({
            userId: sender._id,
            recipientId: recipient._id,
            description: `P2P transfer to ${recipient.firstName}`,
            amount: numericAmount,
            type: 'Debit',
            category: 'Transfer',
            invoiceId: generateInvoiceId(),
        });

        const recipientTx = await Transaction.create({
            userId: recipient._id,
            recipientId: sender._id,
            description: `P2P transfer from ${sender.firstName}`,
            amount: numericAmount,
            type: 'Credit',
            category: 'Transfer',
            invoiceId: generateInvoiceId(),
        });

        sender.accountBalance -= numericAmount;
        recipient.accountBalance += numericAmount;

        await sender.save();
        await recipient.save();

        res.status(200).json({
            message: 'Transfer successful',
            senderTransactionId: senderTx._id,
            recipientTransactionId: recipientTx._id
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message });
    }
};

export const getTransactionSummary = async (req, res) => {
    try {
        const transactions = await Transaction.find({ userId: req.user.id });

        let sent = 0;
        let received = 0;
        let added = 0;

        transactions.forEach((t) => {
            if (t.type === 'Debit') {
                sent += Math.abs(t.amount);
            } else if (t.type === 'Credit') {
                if (t.category === 'Stripe') {
                    added += t.amount;
                } else {
                    received += t.amount;
                }
            }
        });

        res.status(200).json({ sent, received, added });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

export const getTransactions = async (req, res) => {
    try {
        const transactions = await Transaction.find({ userId: req.user.id })
            .sort({ createdAt: -1 });

        res.status(200).json({ transactions });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

