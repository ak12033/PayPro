import { useEffect } from 'react';
import useQuery from '../../../hooks/useQuery';
import { useSocket } from '../../../context/SocketContext';
import { budgetApi } from '../../../services/api/endpoints/budgetApi';

/**
 * The current (or a named) period's budget, kept live via the `budget_update`
 * socket event — a settled transaction anywhere in the app re-triggers a
 * silent background refresh here rather than the user needing to pull to
 * refresh (plan.md §13.7).
 */
export const useBudget = (period = null) => {
    const query = useQuery(async () => {
        try {
            return (await budgetApi.get(period)).data;
        } catch (err) {
            // No budget for this period is a valid, common state — not a
            // failure the ErrorState/retry UI should ever be shown for.
            if (err?.response?.status === 404) return null;
            throw err;
        }
    }, { deps: [period] });
    const { subscribe } = useSocket() ?? {};

    useEffect(() => {
        if (!subscribe) return undefined;
        return subscribe((event) => {
            if (event === 'budget_update') query.refresh();
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subscribe]);

    return query;
};

export default useBudget;
