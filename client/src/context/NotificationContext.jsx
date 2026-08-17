import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { toast } from 'react-hot-toast';
import { useAuth } from './AuthContext';
import { notificationApi } from '../services/api/endpoints/notificationApi';
import {
    requestNotificationToken,
    onForegroundMessage,
    getPushPermission,
} from '../services/firebase';
import ToastCard from '../components/feedback/ToastCard';

const NotificationContext = createContext(null);

export const useNotifications = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotifications must be used within a NotificationProvider');
    }
    return context;
};

export const NotificationProvider = ({ children }) => {
    const { token, isCheckingAuth } = useAuth();
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [pushPermission, setPushPermission] = useState(getPushPermission);

    // Guards against re-registering the device token on every token change.
    const fcmRegistered = useRef(false);

    const fetchNotifications = useCallback(async () => {
        try {
            const { data } = await notificationApi.list();
            setNotifications(data.notifications ?? []);
            /**
             * The unread count comes from the server. It used to be derived
             * from `notifications.filter(...)` over the first page only, so
             * once a user had more than 20 notifications the badge silently
             * under-counted.
             */
            setUnreadCount(data.unreadCount ?? 0);
        } catch {
            // Notifications failing is not worth interrupting the user over;
            // the panel shows its own empty state.
        }
    }, []);

    useEffect(() => {
        if (isCheckingAuth) return;

        if (!token) {
            setNotifications([]);
            setUnreadCount(0);
            fcmRegistered.current = false;
            return;
        }

        fetchNotifications();

        /**
         * Re-register this device's token on every session.
         *
         * Silently — `prompt` is not passed, so this only does anything when
         * the user has already granted permission. FCM tokens rotate (a cleared
         * site, a reinstalled browser, a token Firebase has retired), and a
         * rotated token that is never re-sent means the server keeps pushing to
         * a device that no longer exists.
         */
        if (!fcmRegistered.current) {
            fcmRegistered.current = true;
            (async () => {
                try {
                    const fcmToken = await requestNotificationToken();
                    if (fcmToken) await notificationApi.registerDeviceToken(fcmToken);
                } catch {
                    // Push is an enhancement. A browser that blocks it, or a
                    // missing service worker, must not break the session.
                }
            })();
        }
    }, [token, isCheckingAuth, fetchNotifications]);

    /**
     * Turn push on, from a user gesture.
     *
     * Returns the resulting permission so the caller can explain what happened
     * — "blocked" needs different words from "not now", and a switch that
     * silently springs back to off tells the user nothing.
     */
    const enablePush = useCallback(async () => {
        const fcmToken = await requestNotificationToken({ prompt: true });
        const permission = getPushPermission();
        setPushPermission(permission);

        if (!fcmToken) return permission;

        try {
            await notificationApi.registerDeviceToken(fcmToken);
            fcmRegistered.current = true;
        } catch {
            return 'error';
        }

        return 'granted';
    }, []);

    /**
     * One toast per notification, whichever channel gets here first.
     *
     * An open, connected tab receives every notification twice: once over the
     * socket (`notification_received`) and once as an FCM foreground message.
     * They are the same event — the server writes the record, emits it, and
     * pushes it — so the sender's own device was showing "Transfer Successful"
     * twice, stacked. Both channels now funnel through here and the second
     * arrival for an id is dropped.
     *
     * The ids are kept for a couple of minutes rather than forever: long enough
     * that no two deliveries of one notification can straddle the window,
     * short enough that the set cannot grow for the life of the session.
     */
    const shownToasts = useRef(new Map());

    const showNotificationToast = useCallback(({ id, title, message }) => {
        if (!title && !message) return;

        const now = Date.now();
        for (const [key, at] of shownToasts.current) {
            if (now - at > 2 * 60 * 1000) shownToasts.current.delete(key);
        }

        if (id) {
            if (shownToasts.current.has(id)) return;
            shownToasts.current.set(id, now);
        }

        toast.custom((instance) => (
            <ToastCard visible={instance.visible} title={title} message={message} />
        ));
    }, []);

    /**
     * Register the foreground handler exactly once, and unsubscribe on unmount.
     * A previous implementation re-subscribed after every message without
     * unsubscribing, so handlers accumulated and duplicate toasts multiplied
     * with each notification received.
     */
    useEffect(() => {
        if (!token) return undefined;

        // Data-only messages: title and body arrive in `data`, and
        // `onForegroundMessage` hands that straight over.
        return onForegroundMessage((data) => {
            showNotificationToast({
                id: data.notificationId,
                title: data.title,
                message: data.body,
            });
            fetchNotifications();
        });
    }, [token, fetchNotifications, showNotificationToast]);

    const markAsRead = useCallback(
        async (id) => {
            // Optimistic, but reconciled from the server on failure so the badge
            // cannot drift out of sync with the truth.
            setNotifications((current) =>
                current.map((item) => (item._id === id ? { ...item, isRead: true } : item))
            );
            setUnreadCount((current) => Math.max(0, current - 1));

            try {
                await notificationApi.markAsRead(id);
            } catch {
                fetchNotifications();
            }
        },
        [fetchNotifications]
    );

    const markAllAsRead = useCallback(async () => {
        setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
        setUnreadCount(0);

        try {
            await notificationApi.markAllAsRead();
        } catch {
            fetchNotifications();
        }
    }, [fetchNotifications]);

    const value = useMemo(
        () => ({
            notifications,
            unreadCount,
            markAsRead,
            markAllAsRead,
            refreshNotifications: fetchNotifications,
            pushPermission,
            enablePush,
            showNotificationToast,
        }),
        [
            notifications,
            unreadCount,
            markAsRead,
            markAllAsRead,
            fetchNotifications,
            pushPermission,
            enablePush,
            showNotificationToast,
        ]
    );

    return (
        <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
    );
};
