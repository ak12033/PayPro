import express from 'express';
import {
    addTransaction,
    getPaginatedTransactions,
    getTransactions,
    getTransactionSummary,
    sendMoney,
    getAiInsights,
    askAiAssistant,
    exportTransactionsCsv
} from '../controllers/transactionController.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import { resendTransferOtp, verifyTransferOtp } from '../controllers/otpController.js';
import { transferLimiter, otpVerifyLimiter, otpSendLimiter, aiLimiter } from '../middlewares/rateLimiters.js';

const transactionRouter = express.Router();

transactionRouter.post('/add', authMiddleware, transferLimiter, addTransaction);
transactionRouter.get('/history', authMiddleware, getPaginatedTransactions);
transactionRouter.post('/transfer', authMiddleware, transferLimiter, sendMoney);
transactionRouter.get('/summary', authMiddleware, getTransactionSummary);
transactionRouter.get('/export', authMiddleware, exportTransactionsCsv);

/**
 * These two carried NO auth middleware at all before.
 *
 * `/verify-otp` accepted an arbitrary email in the request body, so any
 * anonymous caller could brute-force or consume another account's pending
 * codes; and `/resend-otp` was a free, unauthenticated relay for sending mail
 * from our SMTP account to any address on the internet.
 */
transactionRouter.post('/verify-otp', authMiddleware, otpVerifyLimiter, verifyTransferOtp);
transactionRouter.post('/resend-otp', authMiddleware, otpSendLimiter, resendTransferOtp);

transactionRouter.get('/recent', authMiddleware, getTransactions);
transactionRouter.get('/insights', authMiddleware, aiLimiter, getAiInsights);
transactionRouter.post('/assistant', authMiddleware, aiLimiter, askAiAssistant);

export default transactionRouter;
