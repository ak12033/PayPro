import api from '../index';

/**
 * Security-centre endpoints.
 *
 * These have existed on the server the whole time and the frontend never called
 * a single one of them. A user could not see where they were signed in, could
 * not sign out a device they had lost, and could not see whether anyone had
 * been failing password attempts against their account — all of which the
 * backend was already recording.
 */
export const securityApi = {
    /** Devices holding a live refresh-token family. */
    getSessions: () => api.get('/security/sessions'),

    /** Revokes one device. The caller's own session is protected server-side. */
    revokeSession: (familyId) => api.delete(`/security/sessions/${familyId}`),

    /**
     * Devices that skip the sign-in code, which is a different thing from a
     * live session: a session ends when it is revoked or expires, a trusted
     * device is a standing decision that outlives every session it issues.
     */
    getTrustedDevices: () => api.get('/security/devices'),

    revokeTrustedDevice: (deviceId) => api.delete(`/security/devices/${deviceId}`),

    revokeAllTrustedDevices: () => api.delete('/security/devices'),

    renameTrustedDevice: (deviceId, name) => api.patch(`/security/devices/${deviceId}`, { name }),

    /** Sign-ins, failures, lockouts, password and email changes. */
    getLoginHistory: ({ page = 1, limit = 20 } = {}) =>
        api.get('/security/login-history', { params: { page, limit } }),

    /** Structured sign-in log: where from, on what device, and how risky. */
    getSignIns: ({ page = 1, limit = 20 } = {}) =>
        api.get('/security/sign-ins', { params: { page, limit } }),

    /** Everything above plus money movement. */
    getActivity: ({ page = 1, limit = 20 } = {}) =>
        api.get('/security/activity', { params: { page, limit } }),

    /** Global revocation — signs out every device including this one. */
    logoutEverywhere: () => api.post('/auth/logout-all'),
};

export default securityApi;
