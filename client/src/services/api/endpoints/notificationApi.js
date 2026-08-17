import api from '../index';

export const notificationApi = {
    list: () => api.get('/notifications'),

    /** Registers this browser's FCM token against the signed-in user. */
    registerDeviceToken: (token) => api.post('/notifications/token', { token }),

    /**
     * Detaches this browser from the account on sign-out, so a signed-out
     * device stops receiving that account's notifications.
     */
    unregisterDeviceToken: (token) => api.delete('/notifications/token', { data: { token } }),

    markAsRead: (id) => api.put(`/notifications/${id}/read`),

    markAllAsRead: () => api.put('/notifications/read-all'),
};

export default notificationApi;
