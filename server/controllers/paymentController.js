import Stripe from 'stripe';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import { generateInvoiceId } from '../utils/generateInvoiceId.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const createPaymentIntent = async (req, res) => {
    try {
        const { amount } = req.body;
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount * 100,  // in paise
            currency: 'inr',
        });

        res.json({ clientSecret: paymentIntent.client_secret });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

export const creditBalance = async (req, res) => {
    try {
        const { amount } = req.body;
        const numericAmount = Number(amount);

        if (numericAmount <= 0)
            return res.status(400).json({ message: 'Amount must be positive' });

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.accountBalance += numericAmount;
        await user.save();

        const invoiceId = generateInvoiceId();

        await Transaction.create({
            userId: user._id,
            description: `Added ₹${numericAmount} via Stripe`,
            amount: numericAmount,
            type: 'Credit',
            category: 'Stripe',
            invoiceId,
        });

        res.status(200).json({ message: 'Balance updated', newBalance: user.accountBalance });
    } catch (err) {
        console.error('Credit Balance Error:', err);
        res.status(500).json({ message: err.message });
    }
};
