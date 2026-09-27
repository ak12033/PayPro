import express from 'express';
import {
    getFaq,
    getTickets,
    postTicket,
    getTicketById,
    postTicketMessage,
    postTicketClose,
} from '../controllers/supportController.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import { supportLimiter } from '../middlewares/rateLimiters.js';

const supportRouter = express.Router();

/**
 * FAQ is public (plan.md §27.2): someone locked out of their account is
 * exactly the person who most needs to read "how do I reset my password", and
 * requiring a session to read static help would be a circular requirement.
 */
supportRouter.get('/faq', getFaq);

supportRouter.use(authMiddleware);

supportRouter.get('/tickets', getTickets);
supportRouter.post('/tickets', supportLimiter, postTicket);
supportRouter.get('/tickets/:id', getTicketById);
supportRouter.post('/tickets/:id/messages', postTicketMessage);
supportRouter.post('/tickets/:id/close', postTicketClose);

export default supportRouter;
