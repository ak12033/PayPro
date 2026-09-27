import mongoose from 'mongoose';

/**
 * A financial goal — a virtual earmark, not a real reservation of wallet
 * money (plan.md §15.2). `currentMinor` is a tracker maintained by
 * `goalService.addContribution`/`removeContribution`; it never drives a
 * change to `User.accountBalance`, and no code path may make it do so. Every
 * goal screen must say so ("Tracked, not locked") because a money product
 * that implies otherwise is misleading.
 */
const goalSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    type: {
        type: String,
        enum: ['emergency', 'vacation', 'vehicle', 'education', 'home', 'custom'],
        default: 'custom',
    },
    icon: { type: String, default: 'PiggyBank' },
    targetMinor: { type: Number, required: true, min: 1 },
    currentMinor: { type: Number, default: 0, min: 0 },
    targetDate: { type: Date, required: true },
    status: { type: String, enum: ['active', 'completed', 'archived'], default: 'active', index: true },
    completedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
    autoContribute: {
        enabled: { type: Boolean, default: false },
        amountMinor: { type: Number, min: 0 },
        dayOfMonth: { type: Number, min: 1, max: 28 },
    },
}, { timestamps: true });

goalSchema.index({ userId: 1, status: 1, createdAt: -1 });

export default mongoose.model('Goal', goalSchema);
