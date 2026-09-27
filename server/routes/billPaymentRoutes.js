import express from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import { requireVerifiedEmail } from '../middlewares/requireVerifiedEmail.js';
import { idempotency } from '../middlewares/idempotency.js';
import { paymentLimiter } from '../middlewares/rateLimiters.js';
import { getBillPaymentStatus, getBillers, postFetchBill, postPayBill } from '../controllers/billPaymentController.js';

/**
 * Paying bills through a provider (plan.md §19.3). Separate from /api/bills,
 * which is reminders only and can never move money (context.md §5.14).
 */
const billPaymentRouter = express.Router();

billPaymentRouter.use(authMiddleware);

billPaymentRouter.get('/status', getBillPaymentStatus);
billPaymentRouter.get('/billers', getBillers);
billPaymentRouter.post('/fetch', paymentLimiter, postFetchBill);
billPaymentRouter.post('/pay', paymentLimiter, requireVerifiedEmail, idempotency('bill_payment'), postPayBill);

export default billPaymentRouter;
