import express from 'express';
import { getInsights, patchDismissInsight } from '../controllers/insightsController.js';
import authMiddleware from '../middlewares/authMiddleware.js';

const insightsRouter = express.Router();

insightsRouter.use(authMiddleware);

insightsRouter.get('/', getInsights);
insightsRouter.patch('/:id/dismiss', patchDismissInsight);

export default insightsRouter;
