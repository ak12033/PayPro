import useQuery from '../../../hooks/useQuery';
import { analyticsApi } from '../../../services/api/endpoints/analyticsApi';

/** Growth of distinct people this wallet has transferred to, plus the top recipients by volume. */
export const useNetworkGrowth = (range) =>
    useQuery(async () => (await analyticsApi.getNetwork(range)).data, { deps: [range] });

export default useNetworkGrowth;
