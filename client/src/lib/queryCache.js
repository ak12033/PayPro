import { subscribeToAccessToken } from '../services/auth/tokenStore';

/**
 * The last value each keyed `useQuery` read, held at module scope so it
 * outlives the page that read it.
 *
 * AppShell remounts the whole page on every navigation (its <main> is keyed on
 * the pathname). Without this, going Home -> Activity -> Home threw away data
 * that had been on screen two seconds earlier and showed skeletons while it
 * was fetched again. With it, the remount paints the last value on its first
 * render and refreshes in the background.
 *
 * Stale-while-revalidate, with no freshness window: a hit is shown and then
 * *always* re-fetched. In a money product the cache may only decide what is
 * shown while the network answers, never whether to ask. A balance served from
 * memory without a fresh check is exactly the bug this must not introduce.
 *
 * Scoped to the session. When the access token is cleared (sign-out, or a
 * refresh that failed) every entry is dropped, so the next person to sign in
 * on this tab can never be shown the previous person's data, not even for one
 * frame.
 */

const entries = new Map();

subscribeToAccessToken((token) => {
    if (!token) entries.clear();
});

/** The cached value for `key`, or `undefined` when there is none. */
export const readQueryCache = (key) => (entries.has(key) ? entries.get(key) : undefined);

export const writeQueryCache = (key, value) => {
    entries.set(key, value);
};

/** Drops every entry whose key starts with `prefix`, or everything when omitted. */
export const clearQueryCache = (prefix) => {
    if (prefix === undefined) {
        entries.clear();
        return;
    }
    for (const key of [...entries.keys()]) if (key.startsWith(prefix)) entries.delete(key);
};
