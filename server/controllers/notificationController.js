import Notification from '../models/Notification.js';
import User from '../models/User.js';

// Get paginated notifications for the authenticated user
export const getNotifications = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        
        const total = await Notification.countDocuments({ userId: req.user.id });
        const notifications = await Notification.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .skip((Number(page) - 1) * Number(limit))
            .limit(Number(limit));

        res.status(200).json({
            notifications,
            total,
            currentPage: Number(page),
            totalPages: Math.ceil(total / Number(limit)),
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Mark a single notification as read
export const markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const notification = await Notification.findOneAndUpdate(
            { _id: id, userId: req.user.id },
            { isRead: true },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }

        res.status(200).json({ success: true, notification });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Mark all notifications as read for the user
export const markAllAsRead = async (req, res) => {
    try {
        await Notification.updateMany(
            { userId: req.user.id, isRead: false },
            { isRead: true }
        );

        res.status(200).json({ success: true, message: 'All notifications marked as read' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Register/Save a new FCM token from the client
export const registerFcmToken = async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ message: 'Token is required' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Add token if it doesn't exist
        if (!user.fcmTokens.includes(token)) {
            user.fcmTokens.push(token);
            await user.save();
        }

        res.status(200).json({ success: true, message: 'Token registered successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
