import express from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import { idempotency } from '../middlewares/idempotency.js';
import { requireVerifiedEmail } from '../middlewares/requireVerifiedEmail.js';
import { createOrder, verifyPayment, handleWebhook, refundPayment, getPaymentHistory } from '../controllers/paymentController.js';
import { paymentLimiter } from '../middlewares/rateLimiters.js';

const paymentRouter = express.Router();

paymentRouter.post('/create-order', authMiddleware, paymentLimiter, requireVerifiedEmail, idempotency('topup-order'), createOrder);
paymentRouter.post('/verify', authMiddleware, paymentLimiter, verifyPayment);
paymentRouter.get('/history', authMiddleware, getPaymentHistory);
paymentRouter.post('/refund', authMiddleware, paymentLimiter, idempotency('refund'), refundPayment);

/**
 * The webhook is intentionally unauthenticated — Razorpay calls it. It is
 * authenticated instead by an HMAC signature over the raw request body.
 *
 * NOTE: the raw-body parser for this exact path is mounted in server.js
 * *before* express.json(), because verification needs the bytes as sent.
 */
paymentRouter.post('/webhook', handleWebhook);

export default paymentRouter;
