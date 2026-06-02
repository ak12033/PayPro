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
    riskScore: { type: Number, default: 0 },
    riskLevel: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
    riskReason: { type: String, default: '' },
}, { timestamps: true });


export default mongoose.model('Transaction', transactionSchema);
