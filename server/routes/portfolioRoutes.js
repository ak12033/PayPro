import express from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
    getPortfolioSummary,
    getHoldings, postHolding, patchHolding, deleteHolding,
    getLiabilities, postLiability, patchLiability, deleteLiability,
} from '../controllers/portfolioController.js';

/** Self-reported holdings and debts (plan.md §21, §22). Moves no money. */
const portfolioRouter = express.Router();

portfolioRouter.use(authMiddleware);

portfolioRouter.get('/summary', getPortfolioSummary);

portfolioRouter.get('/holdings', getHoldings);
portfolioRouter.post('/holdings', postHolding);
portfolioRouter.patch('/holdings/:id', patchHolding);
portfolioRouter.delete('/holdings/:id', deleteHolding);

portfolioRouter.get('/liabilities', getLiabilities);
portfolioRouter.post('/liabilities', postLiability);
portfolioRouter.patch('/liabilities/:id', patchLiability);
portfolioRouter.delete('/liabilities/:id', deleteLiability);

export default portfolioRouter;
