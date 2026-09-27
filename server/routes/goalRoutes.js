import express from 'express';
import {
    getGoals,
    postGoal,
    getGoalById,
    patchGoal,
    deleteGoal,
    postContribution,
    deleteContribution,
    getGoalProjection,
} from '../controllers/goalController.js';
import authMiddleware from '../middlewares/authMiddleware.js';

const goalRouter = express.Router();

goalRouter.use(authMiddleware);

goalRouter.get('/', getGoals);
goalRouter.post('/', postGoal);
goalRouter.get('/:id', getGoalById);
goalRouter.patch('/:id', patchGoal);
goalRouter.delete('/:id', deleteGoal);
goalRouter.post('/:id/contributions', postContribution);
goalRouter.delete('/:id/contributions/:contributionId', deleteContribution);
goalRouter.get('/:id/projection', getGoalProjection);

export default goalRouter;
