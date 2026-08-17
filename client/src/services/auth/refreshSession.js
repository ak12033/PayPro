import axios from 'axios';
import { API_BASE_URL } from '../../app/config/env';
import { REFRESH_TIMEOUT_MS } from '../../constants/app';
import { setAccessToken } from './tokenStore';

/**
 * Exchanges the httpOnly refresh cookie for a new access token.
 *
 * Bare axios, deliberately: routing this through the configured client would
 * recurse into the response interceptor that issues it.
 *
 * Shared by two callers that need exactly the same behaviour:
 *
 *   1. The response interceptor, on a 401 with `TOKEN_EXPIRED`.
 *   2. `AuthProvider` at startup — see below.
 *
 * ── Why startup needs this explicitly ──────────────────────────────────────
 *
 * The access token lives in memory only (never localStorage, so an XSS payload
 * cannot read it). That means after a page reload there is no token at all,
 * only the refresh cookie.
 *
 * The provider used to just call `/users/profile` and rely on the interceptor
 * to notice the 401 and refresh. It never worked. With no token in memory the
 * request goes out with no Authorization header, so the server answers 401 with
 * `code: 'NO_TOKEN'` — not `TOKEN_EXPIRED` — and the interceptor correctly
 * treats an unrecognised code as unrecoverable and signs the user out.
 *
 * The net effect was that **every hard refresh ended the session**, despite a
 * perfectly valid refresh cookie sitting in the browser, and the guard's
 * "Restoring your session…" message described something that could never
 * succeed.
 *
 * Refreshing first, before any authenticated request, makes the bootstrap
 * deterministic instead of depending on a 401 round-trip — and leaves the
 * interceptor's stricter rule intact, which is right: once the app is running,
 * a request that carries no token is a bug, not a session to restore.
 */
export const refreshSession = async () => {
    const { data } = await axios.get(`${API_BASE_URL}/auth/refresh`, {
        withCredentials: true,
        timeout: REFRESH_TIMEOUT_MS,
    });

    const accessToken = data?.accessToken ?? null;
    if (accessToken) setAccessToken(accessToken);

    return accessToken;
};

export default refreshSession;
