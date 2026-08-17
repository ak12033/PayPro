import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema({
    sender: {
        type: String,
        enum: ['user', 'ai'],
        required: true
    },
    text: {
        type: String,
        required: true,
        maxlength: 8000
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { _id: false });

const chatSessionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true // one rolling history per user
    },
    messages: [chatMessageSchema]
}, {
    timestamps: true
});

/**
 * Hard cap on retained turns.
 *
 * The history array was previously unbounded: it grew until the document hit
 * MongoDB's 16MB limit (at which point every save failed permanently), and the
 * entire array was replayed to Gemini on every single message, so token cost
 * grew quadratically with conversation length.
 */
export const MAX_CHAT_MESSAGES = 40;

// `unique: true` above already creates the userId index.

export default mongoose.model('ChatSession', chatSessionSchema);
