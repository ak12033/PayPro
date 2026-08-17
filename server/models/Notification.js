import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['Payment', 'Security', 'Transfer', 'Reminder', 'System'],
        required: true
    },
    title: {
        type: String,
        required: true,
        maxlength: 140
    },
    message: {
        type: String,
        required: true,
        maxlength: 1000
    },
    isRead: {
        type: Boolean,
        default: false
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, { timestamps: true });

// Notification centre: newest first, per user.
notificationSchema.index({ userId: 1, createdAt: -1 });
// Unread badge count.
notificationSchema.index({ userId: 1, isRead: 1 });

export default mongoose.model('Notification', notificationSchema);
