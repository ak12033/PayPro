import express from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import { requireVerifiedEmail } from '../middlewares/requireVerifiedEmail.js';
import { idempotency } from '../middlewares/idempotency.js';
import { transferLimiter, uploadLimiter, verificationLimiter } from '../middlewares/rateLimiters.js';
import { rawDocumentBody } from '../utils/fileUpload.js';
import {
    getWithdrawals, postWithdrawal, postCancelWithdrawal,
    getBankAccounts, postBankAccount, postBankDocument, deleteBankAccount,
} from '../controllers/withdrawalController.js';

/**
 * Withdrawals to the holder's own bank account (plan.md §0.20.3). The operator
 * side is under /api/admin/withdrawals and /api/admin/bank-accounts.
 */
const withdrawalRouter = express.Router();

withdrawalRouter.use(authMiddleware);

withdrawalRouter.get('/', getWithdrawals);
/**
 * Outgoing money, so the same stack as a transfer (context.md §5.8, §5.16):
 * verified email, then the idempotency claim, then the handler.
 */
withdrawalRouter.post('/', transferLimiter, requireVerifiedEmail, idempotency('withdrawal'), postWithdrawal);
withdrawalRouter.post('/:id/cancel', transferLimiter, postCancelWithdrawal);

withdrawalRouter.get('/bank-accounts', getBankAccounts);
withdrawalRouter.post('/bank-accounts', verificationLimiter, requireVerifiedEmail, postBankAccount);
withdrawalRouter.post('/bank-accounts/:id/documents', uploadLimiter, rawDocumentBody, postBankDocument);
withdrawalRouter.delete('/bank-accounts/:id', deleteBankAccount);

export default withdrawalRouter;
