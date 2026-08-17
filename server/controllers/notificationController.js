import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { asInt, asObjectId, asString } from '../utils/sanitize.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// A user with more devices than this is almost certainly accumulating stale
// tokens; keeping the array unbounded grows the document forever and makes
// every push a larger multicast.
const MAX_FCM_TOKENS = 10;

export const getNotifications = asyncHandler(async (req, res) => {
    const page = asInt(req.query.page, { min: 1, max: 10000, fallback: 1 });
    const limit = asInt(req.query.limit, { min: 1, max: 50, fallback: 20 });

    const [notifications, total, unreadCount] = await Promise.all([
        Notification.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        Notification.countDocuments({ userId: req.user.id }),
        // The client previously derived the unread badge from the current page
        // only, so the count was wrong as soon as there was more than one page.
        Notification.countDocuments({ userId: req.user.id, isRead: false })
    ]);

    res.status(200).json({
        notifications,
        total,
        unreadCount,
        currentPage: page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    });
});

export const markAsRead = asyncHandler(async (req, res) => {
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid notification id' });

    // The userId filter is the authorization check: without it any user could
    // mark another user's notifications read by guessing an id.
    const notification = await Notification.findOneAndUpdate(
        { _id: id, userId: req.user.id },
        { isRead: true },
        { new: true }
    );

    if (!notification) {
        return res.status(404).json({ message: 'Notification not found' });
    }

    res.status(200).json({ success: true, notification });
});

export const markAllAsRead = asyncHandler(async (req, res) => {
    await Notification.updateMany(
        { userId: req.user.id, isRead: false },
        { isRead: true }
    );

    res.status(200).json({ success: true, message: 'All notifications marked as read' });
});

export const registerFcmToken = asyncHandler(async (req, res) => {
    const token = asString(req.body?.token, { maxLength: 512 });
    if (!token) {
        return res.status(400).json({ message: 'Token is required' });
    }

    /**
     * `$addToSet` + `$slice` in one atomic update.
     *
     * The old read-modify-write (`if (!tokens.includes(t)) { push; save() }`)
     * lost registrations when two tabs registered concurrently, and let the
     * array grow without limit as users changed devices and browsers.
     */
    const result = await User.updateOne(
        { _id: req.user.id },
        { $addToSet: { fcmTokens: token } }
    );

    if (result.matchedCount === 0) {
        return res.status(404).json({ message: 'User not found' });
    }

    await User.updateOne(
        { _id: req.user.id },
        { $push: { fcmTokens: { $each: [], $slice: -MAX_FCM_TOKENS } } }
    );

    /**
     * A device belongs to whoever is signed in on it *now*.
     *
     * An FCM token identifies a browser, not an account, and nothing ever
     * removed it from the previous account. On any shared or handed-down
     * device — a family laptop, a demo phone, two accounts in one browser —
     * the token stayed on both users, so one person's "You received ₹500"
     * was delivered to a device where somebody else was signed in. Claiming
     * it here makes registration authoritative rather than additive.
     */
    await User.updateMany(
        { _id: { $ne: req.user.id }, fcmTokens: token },
        { $pull: { fcmTokens: token } }
    );

    res.status(200).json({ success: true, message: 'Token registered successfully' });
});

/**
 * Detach this device from the account, on sign-out.
 *
 * Without it a signed-out browser kept receiving that account's push
 * notifications indefinitely — the session was gone, the notifications were
 * not. The token itself stays valid in the browser; it is only the association
 * with this user that ends.
 */
export const unregisterFcmToken = asyncHandler(async (req, res) => {
    const token = asString(req.body?.token, { maxLength: 512 });
    if (!token) {
        return res.status(400).json({ message: 'Token is required' });
    }

    await User.updateOne(
        { _id: req.user.id },
        { $pull: { fcmTokens: token } }
    );

    res.status(200).json({ success: true, message: 'Token removed' });
});
