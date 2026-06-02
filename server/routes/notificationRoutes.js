import express from 'express';
import { getNotifications, markAsRead, markAllAsRead, registerFcmToken } from '../controllers/notificationController.js';
import authMiddleware from '../middlewares/authMiddleware.js';

const notificationRouter = express.Router();

notificationRouter.get('/', authMiddleware, getNotifications);
notificationRouter.put('/read-all', authMiddleware, markAllAsRead);
notificationRouter.put('/:id/read', authMiddleware, markAsRead);
notificationRouter.post('/token', authMiddleware, registerFcmToken);

export default notificationRouter;
