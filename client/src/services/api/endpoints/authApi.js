import api from '../index';
import { getDeviceInfo } from '../../../lib/deviceFingerprint';

/**
 * Authentication endpoints.
 *
 * `/auth/refresh` is intentionally absent: it is driven by the response
 * interceptor with a bare axios call, because routing it through this client
 * would recurse into the interceptor that issued it.
 *
 * Every call that establishes a session carries `deviceInfo` — the attributes
 * the server uses to recognise a device it has seen before. Sending it on
 * signup is what gets the first device trusted immediately; sending it on
 * verification is what lets "trust this device" mean anything.
 */
export const authApi = {
    login: (credentials) => api.post('/auth/login', { ...credentials, deviceInfo: getDeviceInfo() }),

    signup: (payload) => api.post('/auth/signup', { ...payload, deviceInfo: getDeviceInfo() }),

    /**
     * `challengeId` ties this code to the sign-in that requested it, and the
     * device attributes prove it is being entered on the browser that asked.
     * Both are checked server-side before the code is even compared.
     */
    verifyLoginOtp: ({ email, otp, challengeId, trustDevice = false }) =>
        api.post('/auth/verify-login-otp', {
            email,
            otp,
            challengeId,
            trustDevice,
            deviceInfo: getDeviceInfo(),
        }),

    resendLoginOtp: ({ email }) => api.post('/auth/resend-login-otp', { email }),

    logout: () => api.post('/auth/logout'),
};

export default authApi;
