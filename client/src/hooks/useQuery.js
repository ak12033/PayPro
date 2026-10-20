import { useCallback, useEffect, useRef, useState } from 'react';
import { getErrorMessage } from '../utils/errors';
import { readQueryCache, writeQueryCache } from '../lib/queryCache';

/**
 * Data fetching for a screen.
 *
 * Deliberately not a caching library. React Query would be the right answer for
 * a larger surface, but it is a dependency and a mental model, and what this
 * product actually needs from a fetch is four things done consistently:
 *
 *   - a real `error` value, not just a toast that vanishes. A failed request
 *     that only produced a toast left an empty list behind, and an empty list
 *     on a transaction screen reads as "you have no transactions" — which is a
 *     lie, and an alarming one when it is your own money;
 *   - `retry`, so the failure is a fork in the road and not a dead end;
 *   - cancellation, so a resolved request from a page the user has already
 *     left cannot write into unmounted state;
 *   - `refreshing` distinguished from `loading`, so a background refresh does
 *     not blank out data that is already on screen and perfectly readable.
 *
 * Every page-level fetch in the app goes through this, which is what makes the
 * loading and error behaviour uniform without each screen re-implementing it.
 *
 * `key` opts a read into the session cache (lib/queryCache.js). A keyed query
 * that has been read before starts with that value and no loading state, then
 * re-fetches as a background `refresh`, so returning to a screen paints it at
 * once instead of showing skeletons again. The key must name everything the
 * fetcher depends on (`'overview:1M'`, not `'overview'`), since two reads
 * under one key overwrite each other. Leave it off for reads with side effects
 * or ones whose value must never be shown stale even briefly.
 */
export const useQuery = (fetcher, { deps = [], enabled = true, initialData = null, key = null } = {}) => {
    const cached = key ? readQueryCache(key) : undefined;
    const [data, setDataState] = useState(cached !== undefined ? cached : initialData);
    const [loading, setLoading] = useState(enabled && cached === undefined);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);

    const keyRef = useRef(key);
    keyRef.current = key;

    // Held in a ref so a fetcher redefined on every render (the common case,
    // since it usually closes over props) does not restart the effect forever.
    const fetcherRef = useRef(fetcher);
    fetcherRef.current = fetcher;

    const activeRequest = useRef(0);

    const run = useCallback(
        async ({ background = false } = {}) => {
            const requestId = ++activeRequest.current;

            if (background) setRefreshing(true);
            else setLoading(true);
            setError(null);

            try {
                const result = await fetcherRef.current();
                // Discard a response that has been superseded — otherwise a
                // slow first request can land after a fast second one and
                // overwrite newer data with older data.
                if (requestId !== activeRequest.current) return undefined;
                setDataState(result);
                if (keyRef.current) writeQueryCache(keyRef.current, result);
                return result;
            } catch (caught) {
                if (requestId !== activeRequest.current) return undefined;
                setError(getErrorMessage(caught, "We couldn't load this right now."));
                return undefined;
            } finally {
                if (requestId === activeRequest.current) {
                    setLoading(false);
                    setRefreshing(false);
                }
            }
        },
        []
    );

    useEffect(() => {
        if (!enabled) {
            setLoading(false);
            return undefined;
        }

        // A cache hit is already on screen (or is put there now, when the key
        // changed under a mounted query), so the fetch only refreshes it.
        const hit = key ? readQueryCache(key) : undefined;
        if (hit !== undefined) {
            setDataState(hit);
            setLoading(false);
            run({ background: true });
        } else {
            run();
        }

        // Invalidate any in-flight request on unmount or dependency change.
        return () => {
            activeRequest.current += 1;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, run, key, ...deps]);

    // Local edits (an optimistic update, a row removed) go into the cache too,
    // so coming back to the screen does not resurrect what the user changed.
    const setData = useCallback((next) => {
        setDataState((previous) => {
            const value = typeof next === 'function' ? next(previous) : next;
            if (keyRef.current) writeQueryCache(keyRef.current, value);
            return value;
        });
    }, []);

    return {
        data,
        loading,
        refreshing,
        error,
        /** Full reload, with the loading state. */
        retry: useCallback(() => run(), [run]),
        /** Silent reload that leaves existing data on screen. */
        refresh: useCallback(() => run({ background: true }), [run]),
        setData,
    };
};

export default useQuery;
