import express from 'express';
import {
    getRecurring,
    getUpcomingRecurring,
    patchRecurring,
    deleteRecurring,
    postDetect,
} from '../controllers/recurringController.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import { detectionLimiter } from '../middlewares/rateLimiters.js';

const recurringRouter = express.Router();

recurringRouter.use(authMiddleware);

// Literal paths before the parameterised ones, so '/upcoming' is never read as an id.
recurringRouter.get('/upcoming', getUpcomingRecurring);
recurringRouter.post('/detect', detectionLimiter, postDetect);

recurringRouter.get('/', getRecurring);
recurringRouter.patch('/:id', patchRecurring);
recurringRouter.delete('/:id', deleteRecurring);

export default recurringRouter;
