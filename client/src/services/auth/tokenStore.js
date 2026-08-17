/**
 * In-memory access token.
 *
 * Deliberately NOT in localStorage — a token in localStorage is readable by any
 * XSS payload. The refresh token lives in an httpOnly cookie, so a full page
 * reload silently re-establishes the session via /auth/refresh.
 *
 * This lives outside the axios module so both the interceptors and React state
 * can read it without importing the HTTP client.
 *
 * ── Why this is observable ────────────────────────────────────────────────
 *
 * It used to be a bare module variable with no way to learn that it changed.
 * The axios interceptor refreshes the access token silently every 15 minutes
 * and wrote straight into it, so React state — and therefore the Socket.IO
 * connection, which is authenticated with that token — kept the *original*
 * token for the lifetime of the tab. The moment the websocket had to
 * reconnect (a server restart, a laptop waking, a network blip) it handed the
 * server a token that had expired long ago, the handshake was rejected, and
 * live updates stopped for good until the user reloaded the page.
 *
 * Subscribers make the refresh visible to everyone holding a copy.
 */

let accessToken = null;

const subscribers = new Set();

export const setAccessToken = (token) => {
    const next = token ?? null;
    if (next === accessToken) return;

    accessToken = next;
    subscribers.forEach((notify) => {
        try {
            notify(next);
        } catch {
            // A misbehaving subscriber must not prevent the others from being
            // told, nor break the request that triggered the refresh.
        }
    });
};

export const getAccessToken = () => accessToken;

export const clearAccessToken = () => setAccessToken(null);

/** Subscribe to token changes. Returns an unsubscribe function. */
export const subscribeToAccessToken = (notify) => {
    subscribers.add(notify);
    return () => subscribers.delete(notify);
};
