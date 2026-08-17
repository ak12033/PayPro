import express from 'express';
import { chatWithAi, getChatHistory, clearChatHistory } from '../controllers/aiController.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import { aiLimiter } from '../middlewares/rateLimiters.js';

const aiRouter = express.Router();

// Every message here spends real money on our Gemini key, so it is rate limited.
aiRouter.post('/chat', authMiddleware, aiLimiter, chatWithAi);
aiRouter.get('/history', authMiddleware, getChatHistory);
aiRouter.delete('/history', authMiddleware, clearChatHistory);

export default aiRouter;
