import api from '../index';

export const userApi = {
    getProfile: () => api.get('/users/profile'),

    updateProfile: (payload) => api.put('/users/update-profile', payload),

    /**
     * Notification and security preferences.
     *
     * A separate endpoint from `updateProfile` on purpose: profile edits are
     * gated on the current password, and requiring a password to flip "email
     * alerts" off would be absurd friction.
     */
    updateSettings: (preferences) => api.put('/users/settings', preferences),

    /**
     * Directory used by the recipient picker.
     *
     * Paginated and searchable *server-side*. The picker used to fetch the
     * whole directory once and filter it in the browser, which meant the list
     * silently truncated at the server's page limit — so a recipient who
     * existed simply could not be found by typing their name.
     */
    search: ({ search, page = 1, limit = 25 } = {}) =>
        api.get('/users/all', { params: { ...(search && { search }), page, limit } }),
};

export default userApi;
