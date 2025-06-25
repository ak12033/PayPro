import express from 'express';
import { addTransaction, getPaginatedTransactions, getTransactions, getTransactionSummary, sendMoney } from '../controllers/transactionController.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import { resendOtp, verifyOtp } from '../controllers/otpController.js';

const transactionRouter = express.Router();

transactionRouter.post('/add', authMiddleware, addTransaction);
transactionRouter.get('/history', authMiddleware, getPaginatedTransactions);
transactionRouter.post('/transfer', authMiddleware, sendMoney);
transactionRouter.get('/summary', authMiddleware, getTransactionSummary);
transactionRouter.post('/verify-otp', verifyOtp);
transactionRouter.post('/resend-otp', resendOtp);
transactionRouter.get('/recent', authMiddleware, getTransactions);

export default transactionRouter;
