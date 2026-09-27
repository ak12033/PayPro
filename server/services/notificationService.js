import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { sendPushNotification } from '../utils/fcm.js';
import { emitToUser } from '../utils/socket.js';
import { APP_TIMEZONE } from '../utils/period.js';
import { pushDecision } from './notificationPolicy.js';
import logger from '../utils/logger.js';

/**
 * Where tapping a notification should land.
 *
 * A push that opens the home screen makes the user hunt for the thing it was
 * telling them about. These are the screens each kind of notification is
 * actually about.
 */
const DEEP_LINKS = {
    Transfer: '/activity',
    Payment: '/activity',
    Security: '/account/security',
    Reminder: '/home',
    System: '/home',
    Budget: '/insights/budgets',
    Goal: '/insights/goals',
    Bill: '/insights/bills',
    Insight: '/insights',
    Support: '/account/support',
    Account: '/account/verification',
};

/**
 * `options.dedupeKey` ties this call to the unique+sparse index on
 * `Notification` (plan.md §26.2.2). A duplicate key is an *expected* outcome
 * here — the same budget threshold crossed twice, the same day's
 * reconciliation alert — not an error, so the 11000 duplicate-key exception
 * is swallowed exactly like every other failure in this best-effort function.
 */
export const notifyUser = async (userId, type, title, message, metadata = {}, options = {}) => {
    try {
        // 1. Save to database
        const notification = await Notification.create({
            userId,
            type,
            title,
            message,
            metadata,
            // Omitted entirely when absent (not set to `null`) — see the
            // schema comment on `dedupeKey` for why that distinction is
            // what makes the sparse unique index work at all.
            ...(options.category !== undefined && { category: options.category }),
            ...(options.dedupeKey !== undefined && { dedupeKey: options.dedupeKey }),
        });

        // 1b. Emit Socket.IO Event for live updates
        emitToUser(userId.toString(), 'notification_received', { notification });

        // 2. Fetch user tokens
        const user = await User.findById(userId).select('fcmTokens preferences');

        /**
         * 3. Send the push, unless the user has turned push off — entirely, for
         * this category, or for their quiet hours (see notificationPolicy.js;
         * security alerts ignore the last two).
         *
         * The preference existed as a toggle in the account screen and was read
         * by nobody — switching it off changed the switch and nothing else.
         * The in-app record above is still written either way, so the
         * notification is waiting in the panel when they next open the app.
         */
        const pushEnabled = pushDecision({
            type,
            preferences: user?.preferences ?? {},
            timeZone: APP_TIMEZONE,
        }).send;

        if (pushEnabled && user?.fcmTokens?.length > 0) {
            const result = await sendPushNotification(user.fcmTokens, {
                title,
                body: message,
                data: {
                    type,
                    ...metadata,
                    link: DEEP_LINKS[type] ?? '/',
                    // FCM data values must be strings
                    notificationId: notification._id.toString()
                }
            });

            // Cleanup stale tokens
            if (result && result.failedTokens && result.failedTokens.length > 0) {
                await User.updateOne(
                    { _id: userId },
                    { $pull: { fcmTokens: { $in: result.failedTokens } } }
                );
            }
        }

        return notification;
    } catch (error) {
        logger.error('Notification service error', { err: error });
        // Don't throw, so we don't break the main flow (e.g. login/payment)
        return null;
    }
};
