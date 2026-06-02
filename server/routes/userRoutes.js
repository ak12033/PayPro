import express from 'express';
import { getAllUsers, getAccountBalance, getUserProfile, updateUserProfile, updateSettings } from '../controllers/userController.js';
import authMiddleware from '../middlewares/authMiddleware.js';

const userRouter = express.Router();

userRouter.get('/all', authMiddleware, getAllUsers);
userRouter.get('/balance', authMiddleware, getAccountBalance);
userRouter.get('/profile', authMiddleware, getUserProfile);
userRouter.put('/update-profile', authMiddleware, updateUserProfile);
userRouter.put('/settings', authMiddleware, updateSettings);

export default userRouter;
