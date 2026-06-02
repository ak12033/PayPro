import express from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import { createOrder, verifyPayment, handleWebhook, refundPayment, getPaymentHistory } from '../controllers/paymentController.js';

const paymentRouter = express.Router();

paymentRouter.post('/create-order', authMiddleware, createOrder);
paymentRouter.post('/verify', authMiddleware, verifyPayment);
paymentRouter.get('/history', authMiddleware, getPaymentHistory);
paymentRouter.post('/webhook', handleWebhook); // Webhook shouldn't have authMiddleware, razorpay sends this
paymentRouter.post('/refund', authMiddleware, refundPayment);

export default paymentRouter;