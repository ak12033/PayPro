import express from 'express';
import {
    getPayees,
    postPayee,
    patchPayee,
    deletePayee,
    getPaymentCode,
    postResolvePaymentCode,
} from '../controllers/payeeController.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import { paymentCodeLimiter } from '../middlewares/rateLimiters.js';

const payeeRouter = express.Router();

payeeRouter.use(authMiddleware);

/**
 * QR payment codes (plan.md §9.3). A code is an address, not a mandate:
 * resolving one pre-fills a recipient and authorises nothing.
 */
payeeRouter.get('/payment-code', paymentCodeLimiter, getPaymentCode);
payeeRouter.post('/payment-code/resolve', paymentCodeLimiter, postResolvePaymentCode);

payeeRouter.get('/', getPayees);
payeeRouter.post('/', postPayee);
payeeRouter.patch('/:id', patchPayee);
payeeRouter.delete('/:id', deletePayee);

export default payeeRouter;
