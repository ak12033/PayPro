import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import { generateInvoiceId } from '../utils/generateInvoiceId.js';
import { categorizeTransaction, checkFraud, getInsights, getAssistantResponse } from '../utils/fastapiClient.js';
import Otp from '../models/Otp.js';
import sendOtp from '../utils/sendOtp.js';
import bcrypt from 'bcryptjs';
import { notifyUser } from '../services/notificationService.js';
import { emitToUser } from '../utils/socket.js';

export const addTransaction = async (req, res) => {
    try {
        const { description, amount, type = 'Debit' } = req.body;
        const numericAmount = Number(amount);

        if (isNaN(numericAmount) || numericAmount <= 0) {
            return res.status(400).json({ message: 'Amount must be a positive number' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (type === 'Debit' && user.accountBalance < numericAmount) {
            return res.status(400).json({ message: 'Insufficient balance' });
        }

        // 1. AI Categorization via FastAPI
        const aiCategoryData = await categorizeTransaction(description, numericAmount);
        const category = aiCategoryData.category;
        const icon = aiCategoryData.icon;

        // 2. Fetch history for fraud check
        const history = await Transaction.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .limit(10)
            .select('description amount type category createdAt -_id');

        // 3. AI Fraud Check via FastAPI
        const fraudResult = await checkFraud({
            description, amount: numericAmount, type, category
        }, history);

        // 4. Create transaction
        const transaction = await Transaction.create({
            userId: req.user.id,
            description,
            amount: numericAmount,
            type,
            category,
            icon,
            invoiceId: generateInvoiceId(),
            riskScore: fraudResult.risk_score,
            riskLevel: fraudResult.risk_level,
            riskReason: fraudResult.reason
        });

        // 5. Update Balance
        if (type === 'Debit') {
            user.accountBalance -= numericAmount;
        } else {
            user.accountBalance += numericAmount;
        }
        await user.save();

        emitToUser(user._id.toString(), 'wallet_update', {
            newBalance: user.accountBalance,
            transaction
        });

        if (fraudResult.risk_level === 'high') {
            await notifyUser(
                req.user.id,
                'Security',
                'High Risk Transaction Detected',
                `A recent transaction of ₹${numericAmount} for "${description}" was flagged as high risk. Please review your account.`,
                { amount: numericAmount, transactionId: transaction._id.toString() }
            );
        }

        res.status(201).json({ message: 'Transaction added successfully', transaction });
    } catch (err) {
        console.error('Add Transaction Error:', err);
        res.status(500).json({ message: 'Failed to add transaction' });
    }
};

export const getPaginatedTransactions = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            search = '',
            type,
            category,
            minAmount,
            maxAmount,
            startDate,
            endDate,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        const query = { userId: req.user.id };

        // Advanced Search & Filtering
        if (search) {
            query.description = { $regex: search, $options: 'i' };
        }
        if (type) {
            query.type = type;
        }
        if (category) {
            query.category = category;
        }
        if (minAmount || maxAmount) {
            query.amount = {};
            if (minAmount) query.amount.$gte = Number(minAmount);
            if (maxAmount) query.amount.$lte = Number(maxAmount);
        }
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        // Sorting
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const total = await Transaction.countDocuments(query);
        const transactions = await Transaction.find(query)
            .sort(sortOptions)
            .skip((Number(page) - 1) * Number(limit))
            .limit(Number(limit));

        res.status(200).json({
            transactions,
            total,
            currentPage: Number(page),
            totalPages: Math.ceil(total / Number(limit)),
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

export const getAiInsights = async (req, res) => {
    try {
        // Fetch recent transactions for insights
        const transactions = await Transaction.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .limit(50)
            .select('description amount type category createdAt -_id');

        const insights = await getInsights(transactions);

        res.status(200).json({ insights });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const askAiAssistant = async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) return res.status(400).json({ message: 'Query is required' });

        // Fetch recent transactions for context
        const transactions = await Transaction.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .limit(20)
            .select('description amount type category createdAt -_id');

        const response = await getAssistantResponse(query, transactions);

        res.status(200).json({ response });
    } catch (error) {
        res.status(500).json({ message: error.message });
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

        // History for sender fraud check
        const history = await Transaction.find({ userId: sender._id })
            .sort({ createdAt: -1 })
            .limit(10)
            .select('description amount type category createdAt -_id');

        // Fraud check for sender
        const fraudResult = await checkFraud({
            description: `P2P transfer to ${recipient.firstName}`,
            amount: numericAmount,
            type: 'Debit',
            category: 'Transfer'
        }, history);

        // Proceed with transfer
        const senderTx = await Transaction.create({
            userId: sender._id,
            recipientId: recipient._id,
            description: `P2P transfer to ${recipient.firstName}`,
            amount: numericAmount,
            type: 'Debit',
            category: 'Transfer',
            icon: 'Send',
            invoiceId: generateInvoiceId(),
            riskScore: fraudResult.risk_score,
            riskLevel: fraudResult.risk_level,
            riskReason: fraudResult.reason
        });

        const recipientTx = await Transaction.create({
            userId: recipient._id,
            recipientId: sender._id,
            description: `P2P transfer from ${sender.firstName}`,
            amount: numericAmount,
            type: 'Credit',
            category: 'Transfer',
            icon: 'Download',
            invoiceId: generateInvoiceId(),
            riskScore: 0,
            riskLevel: 'low',
            riskReason: 'Incoming transfer'
        });

        sender.accountBalance -= numericAmount;
        recipient.accountBalance += numericAmount;

        await sender.save();
        await recipient.save();

        emitToUser(sender._id.toString(), 'wallet_update', {
            newBalance: sender.accountBalance,
            transaction: senderTx
        });

        emitToUser(recipient._id.toString(), 'wallet_update', {
            newBalance: recipient.accountBalance,
            transaction: recipientTx
        });

        // Notify Sender
        await notifyUser(
            sender._id,
            'Transfer',
            'Transfer Successful',
            `You successfully sent ₹${numericAmount} to ${recipient.firstName}.`,
            { amount: numericAmount, recipient: recipient.firstName }
        );

        // Notify Recipient
        await notifyUser(
            recipient._id,
            'Transfer',
            'Money Received',
            `You received ₹${numericAmount} from ${sender.firstName}.`,
            { amount: numericAmount, sender: sender.firstName }
        );

        // Fraud alert if sender transaction is high risk
        if (fraudResult.risk_level === 'high') {
            await notifyUser(
                sender._id,
                'Security',
                'High Risk Transfer Detected',
                `Your recent transfer of ₹${numericAmount} to ${recipient.firstName} was flagged as unusual.`,
                { amount: numericAmount }
            );
        }

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
                if (t.category === 'Top Up' || t.category === 'Stripe') {
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
