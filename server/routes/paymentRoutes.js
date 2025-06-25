import express from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import { createPaymentIntent, creditBalance} from '../controllers/paymentController.js';

const paymentRouter = express.Router();

paymentRouter.post('/create-payment-intent', authMiddleware, createPaymentIntent);
paymentRouter.post('/credit-balance', authMiddleware, creditBalance);

export default paymentRouter;