import express from 'express';
import {
    getAllUsers,
    getAccountBalance,
    getUserProfile,
    updateUserProfile,
    updateSettings,
    closeMyAccount,
    exportMyData
} from '../controllers/userController.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import { directoryLimiter } from '../middlewares/rateLimiters.js';

const userRouter = express.Router();

userRouter.get('/all', authMiddleware, directoryLimiter, getAllUsers);
userRouter.get('/balance', authMiddleware, getAccountBalance);
userRouter.get('/profile', authMiddleware, getUserProfile);
userRouter.put('/update-profile', authMiddleware, updateUserProfile);
userRouter.put('/settings', authMiddleware, updateSettings);
userRouter.post('/me/close', authMiddleware, closeMyAccount);
userRouter.post('/me/export', authMiddleware, exportMyData);

export default userRouter;
