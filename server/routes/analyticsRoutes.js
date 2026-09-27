import express from 'express';
import {
    getOverview,
    getCategoryBreakdown,
    getNetworkGrowth,
    getPaymentsStatus,
    getCashflow,
    getMerchantBreakdown,
    getTopExpenses,
    getFinancialHealthScore,
    getSpendingRhythm
} from '../controllers/analyticsController.js';
import authMiddleware from '../middlewares/authMiddleware.js';

const analyticsRouter = express.Router();

analyticsRouter.get('/overview', authMiddleware, getOverview);
analyticsRouter.get('/categories', authMiddleware, getCategoryBreakdown);
analyticsRouter.get('/network', authMiddleware, getNetworkGrowth);
analyticsRouter.get('/payments-status', authMiddleware, getPaymentsStatus);
analyticsRouter.get('/cashflow', authMiddleware, getCashflow);
analyticsRouter.get('/merchants', authMiddleware, getMerchantBreakdown);
analyticsRouter.get('/top-expenses', authMiddleware, getTopExpenses);
analyticsRouter.get('/spending-rhythm', authMiddleware, getSpendingRhythm);
// plan.md §25. Not a credit score — the response carries the disclaimer the UI must render.
analyticsRouter.get('/financial-health', authMiddleware, getFinancialHealthScore);

export default analyticsRouter;
