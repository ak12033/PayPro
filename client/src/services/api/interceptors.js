import { AUTH_EXPIRED_EVENT } from '../../constants/app';
import { clearAccessToken, getAccessToken } from '../auth/tokenStore';
import { refreshSession } from '../auth/refreshSession';

const notifyAuthExpired = () => {
    clearAccessToken();
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
};

/**
 * Refresh state, shared by every client this is attached to.
 *
 * It is module-level rather than per-instance because there is now more than
 * one instance: the Node backend and the AI service are separate origins with
 * separate axios clients, but one session behind them. Per-instance state let
 * a 401 on each fire its own refresh, and the server rotates refresh tokens —
 * the second request presents an already-consumed token, gets a 401 back, and
 * signs the user out mid-session. One queue means one refresh, whichever client
 * noticed first, with the rest retrying on the token it produced.
 */
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach(({ resolve, reject }) => {
        if (error) reject(error);
        else resolve(token);
    });
    failedQueue = [];
};

/**
 * Attaches the bearer token and the silent-refresh retry cycle to a client.
 *
 * Written as a function over an instance rather than as top-level side effects
 * so the behaviour is testable and the client module has no auth dependency.
 */
export const attachAuthInterceptors = (client) => {
    client.interceptors.request.use(
        (config) => {
            const token = getAccessToken();
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
            return config;
        },
        (error) => Promise.reject(error)
    );

    client.interceptors.response.use(
        (response) => response,
        async (error) => {
            const originalRequest = error.config;

            /**
             * `error.config` is undefined for request-setup failures and for some
             * network errors. Reading `originalRequest._retry` on it threw a
             * TypeError *inside the interceptor*, which replaced the real network
             * error with a confusing one.
             */
            if (!originalRequest || error.response?.status !== 401) {
                return Promise.reject(error);
            }

            /**
             * Only attempt a silent refresh when the server says the token expired.
             *
             * The server distinguishes TOKEN_EXPIRED from TOKEN_INVALID /
             * TOKEN_REVOKED / NO_TOKEN. Treating every 401 as refreshable
             * produced a 401 -> refresh -> 401 loop for a revoked session. A
             * revoked or invalid token should log the user out.
             */
            const code = error.response?.data?.code;
            if (code && code !== 'TOKEN_EXPIRED') {
                notifyAuthExpired();
                return Promise.reject(error);
            }

            // Never try to refresh the refresh call itself.
            if (originalRequest.url?.includes('/auth/refresh') || originalRequest._retry) {
                notifyAuthExpired();
                return Promise.reject(error);
            }

            if (isRefreshing) {
                // Queue behind the in-flight refresh. `_retry` is set here too;
                // unmarked queued requests started the whole cycle again on a
                // second 401 of the replayed request.
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                }).then((token) => {
                    originalRequest._retry = true;
                    originalRequest.headers.Authorization = `Bearer ${token}`;
                    return client(originalRequest);
                });
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                // Shared with the startup bootstrap in AuthProvider, so there is
                // exactly one implementation of "exchange the cookie for a
                // token" and the two cannot drift.
                const newAccessToken = await refreshSession();

                processQueue(null, newAccessToken);
                originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;

                return client(originalRequest);
            } catch (refreshError) {
                processQueue(refreshError, null);
                notifyAuthExpired();
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }
    );

    return client;
};
