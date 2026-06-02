import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { sendPushNotification } from '../utils/fcm.js';
import { emitToUser } from '../utils/socket.js';

export const notifyUser = async (userId, type, title, message, metadata = {}) => {
    try {
        // 1. Save to database
        const notification = await Notification.create({
            userId,
            type,
            title,
            message,
            metadata
        });

        // 1b. Emit Socket.IO Event for live updates
        emitToUser(userId.toString(), 'notification_received', { notification });

        // 2. Fetch user tokens
        const user = await User.findById(userId).select('fcmTokens');
        
        // 3. Send Push Notification if tokens exist
        if (user && user.fcmTokens && user.fcmTokens.length > 0) {
            const payload = {
                notification: {
                    title,
                    body: message
                },
                data: {
                    type,
                    ...metadata,
                    // FCM data values must be strings
                    notificationId: notification._id.toString()
                }
            };

            const result = await sendPushNotification(user.fcmTokens, payload);
            
            // Cleanup stale tokens
            if (result && result.failedTokens && result.failedTokens.length > 0) {
                user.fcmTokens = user.fcmTokens.filter(token => !result.failedTokens.includes(token));
                await user.save();
            }
        }

        return notification;
    } catch (error) {
        console.error('Notification Service Error:', error);
        // Don't throw, so we don't break the main flow (e.g. login/payment)
        return null;
    }
};
