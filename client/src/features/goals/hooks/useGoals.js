import { useEffect } from 'react';
import useQuery from '../../../hooks/useQuery';
import { useSocket } from '../../../context/SocketContext';
import { goalApi } from '../../../services/api/endpoints/goalApi';

export const useGoals = (status = 'active') => {
    const query = useQuery(async () => (await goalApi.list(status)).data?.goals ?? [], { deps: [status] });
    const { subscribe } = useSocket() ?? {};

    useEffect(() => {
        if (!subscribe) return undefined;
        return subscribe((event) => {
            if (event === 'goal_update') query.refresh();
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subscribe]);

    return query;
};

export default useGoals;
