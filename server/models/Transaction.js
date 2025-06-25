import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    recipientId: mongoose.Schema.Types.ObjectId,
    description: String,
    amount: Number,
    type: String, // 'Credit' or 'Debit'
    category: String,
    icon: {type: String, default: 'ShoppingBag'},
    invoiceId: { type: String, unique: true, required: true },
}, { timestamps: true });


export default mongoose.model('Transaction', transactionSchema);
