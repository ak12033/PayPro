import express from 'express';
import {
    addTransaction,
    getPaginatedTransactions,
    getTransactions,
    getTransactionSummary,
    getRecentRecipients,
    getCategories,
    getTransactionById,
    updateTransactionCategory,
    sendMoney,
    exportTransactionsCsv,
    getStatement,
    getCategoryRules,
    deleteCategoryRule
} from '../controllers/transactionController.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import { idempotency } from '../middlewares/idempotency.js';
import { requireVerifiedEmail } from '../middlewares/requireVerifiedEmail.js';
import { resendTransferOtp, verifyTransferOtp } from '../controllers/otpController.js';
import { transferLimiter, otpVerifyLimiter, otpSendLimiter } from '../middlewares/rateLimiters.js';

const transactionRouter = express.Router();

transactionRouter.get('/categories', authMiddleware, getCategories);
// Standing "always categorise X as Y" rules (plan.md §12.4).
transactionRouter.get('/category-rules', authMiddleware, getCategoryRules);
transactionRouter.delete('/category-rules/:id', authMiddleware, deleteCategoryRule);

transactionRouter.post('/add', authMiddleware, transferLimiter, idempotency('manual-transaction'), addTransaction);
transactionRouter.get('/history', authMiddleware, getPaginatedTransactions);
// Verification is checked before the idempotency claim, so a refused attempt
// does not burn the key the client will retry with once verified.
transactionRouter.post('/transfer', authMiddleware, transferLimiter, requireVerifiedEmail, idempotency('transfer'), sendMoney);
transactionRouter.get('/summary', authMiddleware, getTransactionSummary);
transactionRouter.get('/export', authMiddleware, exportTransactionsCsv);
transactionRouter.get('/statement', authMiddleware, getStatement);

/**
 * These two carried NO auth middleware at all before.
 *
 * `/verify-otp` accepted an arbitrary email in the request body, so any
 * anonymous caller could brute-force or consume another account's pending
 * codes; and `/resend-otp` was a free, unauthenticated relay for sending mail
 * from our SMTP account to any address on the internet.
 */
transactionRouter.post('/verify-otp', authMiddleware, otpVerifyLimiter, requireVerifiedEmail, verifyTransferOtp);
transactionRouter.post('/resend-otp', authMiddleware, otpSendLimiter, resendTransferOtp);

transactionRouter.get('/recent', authMiddleware, getTransactions);
transactionRouter.get('/recent-recipients', authMiddleware, getRecentRecipients);

// Parameterised routes last: an earlier `/:id` would otherwise swallow every
// literal path above it (a GET to `/recent` would match `:id = "recent"`).
transactionRouter.patch('/:id/category', authMiddleware, updateTransactionCategory);
transactionRouter.get('/:id', authMiddleware, getTransactionById);

export default transactionRouter;
