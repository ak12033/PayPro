import express from 'express';
import {
    getBudget,
    postBudget,
    patchBudget,
    deleteBudget,
    getBudgetHistory,
    getBudgetSuggestions,
    postBudgetRollover,
} from '../controllers/budgetController.js';
import authMiddleware from '../middlewares/authMiddleware.js';

const budgetRouter = express.Router();

budgetRouter.use(authMiddleware);

// Literal paths before the parameterised `/:id` routes.
budgetRouter.get('/history', getBudgetHistory);
budgetRouter.get('/suggestions', getBudgetSuggestions);

budgetRouter.get('/', getBudget);
budgetRouter.post('/', postBudget);
budgetRouter.patch('/:id', patchBudget);
budgetRouter.delete('/:id', deleteBudget);
budgetRouter.post('/:id/rollover', postBudgetRollover);

export default budgetRouter;
