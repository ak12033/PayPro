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

    /** Always answers 200 regardless of whether the address exists — see the server-side comment. */
    forgotPassword: ({ email }) => api.post('/auth/forgot-password', { email }),

    resetPassword: ({ email, otp, password }) =>
        api.post('/auth/reset-password', { email, otp, password }),

    /**
     * Email ownership (plan.md §31.2.7). Signup already sent the first code;
     * these re-send it and confirm it. Both act on the signed-in account's own
     * address — there is no email parameter to point them anywhere else.
     */
    sendEmailVerification: () => api.post('/auth/verify-email/send'),

    verifyEmail: ({ otp }) => api.post('/auth/verify-email', { otp }),

    /**
     * Authenticator app (plan.md §31.2.4). `setup` returns the secret and the
     * otpauth URI once; `enable` returns the recovery codes once. Removing the
     * app or re-issuing codes needs the password and a current code.
     */
    getTotpStatus: () => api.get('/auth/totp'),
    startTotpSetup: () => api.post('/auth/totp/setup'),
    enableTotp: ({ code }) => api.post('/auth/totp/enable', { code }),
    disableTotp: ({ currentPassword, code }) => api.post('/auth/totp/disable', { currentPassword, code }),
    regenerateRecoveryCodes: ({ currentPassword, code }) =>
        api.post('/auth/totp/recovery-codes', { currentPassword, code }),
};

export default authApi;
