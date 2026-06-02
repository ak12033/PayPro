import express from 'express';
import { chatWithAi, getChatHistory, clearChatHistory } from '../controllers/aiController.js';
import authMiddleware from '../middlewares/authMiddleware.js';

const aiRouter = express.Router();

aiRouter.post('/chat', authMiddleware, chatWithAi);
aiRouter.get('/history', authMiddleware, getChatHistory);
aiRouter.delete('/history', authMiddleware, clearChatHistory);

export default aiRouter;
