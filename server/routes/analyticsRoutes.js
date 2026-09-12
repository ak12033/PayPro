import express from 'express';
import {
    getOverview,
    getCategoryBreakdown,
    getNetworkGrowth,
    getPaymentsStatus
} from '../controllers/analyticsController.js';
import authMiddleware from '../middlewares/authMiddleware.js';

const analyticsRouter = express.Router();

analyticsRouter.get('/overview', authMiddleware, getOverview);
analyticsRouter.get('/categories', authMiddleware, getCategoryBreakdown);
analyticsRouter.get('/network', authMiddleware, getNetworkGrowth);
analyticsRouter.get('/payments-status', authMiddleware, getPaymentsStatus);

export default analyticsRouter;
