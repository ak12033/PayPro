import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/api';
import { useAuth } from './AuthContext';
import { requestForToken, onMessageListener } from '../firebase';
import { toast } from 'react-hot-toast';

const NotificationContext = createContext();

export const useNotifications = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }) => {
    const { token, isCheckingAuth } = useAuth();
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        if (token && !isCheckingAuth) {
            fetchNotifications();
            setupFirebase();
        } else {
            setNotifications([]);
            setUnreadCount(0);
        }
    }, [token, isCheckingAuth]);

    const fetchNotifications = async () => {
        try {
            const res = await api.get('/notifications');
            setNotifications(res.data.notifications);
            setUnreadCount(res.data.notifications.filter(n => !n.isRead).length);
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        }
    };

    const setupFirebase = async () => {
        try {
            const fcmToken = await requestForToken();
            if (fcmToken) {
                // Register token with backend
                await api.post('/notifications/token', { token: fcmToken });
            }

            // Listen for foreground messages
            listenForMessages();
        } catch (error) {
            console.error('Firebase setup failed:', error);
        }
    };

    const listenForMessages = async () => {
        try {
            const payload = await onMessageListener();
            
            // Show toast
            toast.custom((t) => (
                <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-slate-800 shadow-lg rounded-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5`}>
                    <div className="flex-1 w-0 p-4">
                        <div className="flex items-start">
                            <div className="ml-3 flex-1">
                                <p className="text-sm font-medium text-white">
                                    {payload.notification?.title || 'New Notification'}
                                </p>
                                <p className="mt-1 text-sm text-slate-300">
                                    {payload.notification?.body}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            ));

            // Refetch to get the latest DB notification
            fetchNotifications();
            
            // Re-attach listener
            listenForMessages();
        } catch (error) {
            // Error typically means listener failed or app is shutting down
            console.error(error);
        }
    };

    const markAsRead = async (id) => {
        try {
            await api.put(`/notifications/${id}/read`);
            setNotifications(prev => 
                prev.map(n => n._id === id ? { ...n, isRead: true } : n)
            );
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (error) {
            console.error('Failed to mark as read:', error);
        }
    };

    const markAllAsRead = async () => {
        try {
            await api.put('/notifications/read-all');
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
            setUnreadCount(0);
        } catch (error) {
            console.error('Failed to mark all as read:', error);
        }
    };

    return (
        <NotificationContext.Provider value={{
            notifications,
            unreadCount,
            markAsRead,
            markAllAsRead,
            refreshNotifications: fetchNotifications
        }}>
            {children}
        </NotificationContext.Provider>
    );
};
