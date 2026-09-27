import express from 'express';
import {
    getBills,
    postBill,
    patchBill,
    removeBill,
    postMarkPaid,
    postSeedFromRecurring,
} from '../controllers/billController.js';
import authMiddleware from '../middlewares/authMiddleware.js';

const billRouter = express.Router();

billRouter.use(authMiddleware);

billRouter.post('/seed-from-recurring', postSeedFromRecurring);

billRouter.get('/', getBills);
billRouter.post('/', postBill);
billRouter.patch('/:id', patchBill);
billRouter.delete('/:id', removeBill);
/**
 * Records that a bill was paid — it does not pay one. PayPro has no payout
 * rail and no BBPS connectivity (plan.md §19.1); this links an existing
 * transaction and rolls the next occurrence forward.
 */
billRouter.post('/:id/mark-paid', postMarkPaid);

export default billRouter;
