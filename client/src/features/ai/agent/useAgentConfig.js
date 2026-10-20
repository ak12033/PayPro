import { useEffect, useState } from 'react';
import { agentApi } from '../../../services/api/endpoints/agentApi';

const LEGACY = { mode: 'legacy', features: {}, starters: [] };

/**
 * Which assistant this account gets, decided by the server (plan.md §38).
 *
 * Fetched when the sheet opens, never on mount. Any failure — a network
 * error, or a server that predates `/ai/agent/config` (404) — is the legacy
 * assistant: that is the one that has always worked, and choosing it can
 * never offer an action the server would refuse.
 */
export const useAgentConfig = (enabled, route) => {
    const [state, setState] = useState({ loading: false, config: null });

    useEffect(() => {
        if (!enabled) {
            // Forget the last answer on close, so reopening never flashes the
            // previous mode's chat (or fires its history request) first.
            setState({ loading: false, config: null });
            return undefined;
        }

        let cancelled = false;
        setState({ loading: true, config: null });

        agentApi
            .getConfig(route)
            .then(({ data }) => {
                if (cancelled) return;
                const mode = data?.mode === 'v2' ? 'v2' : 'legacy';
                setState({
                    loading: false,
                    config: {
                        mode,
                        features: data?.features ?? {},
                        starters: Array.isArray(data?.starters) ? data.starters : [],
                    },
                });
            })
            .catch(() => {
                if (!cancelled) setState({ loading: false, config: LEGACY });
            });

        return () => {
            cancelled = true;
        };
        // The route is read once per opening: starters for the page the user
        // opened the sheet from, not refetched as they navigate behind it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled]);

    return state;
};

export default useAgentConfig;
