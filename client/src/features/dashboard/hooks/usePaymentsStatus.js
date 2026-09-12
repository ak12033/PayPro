import useQuery from '../../../hooks/useQuery';
import { analyticsApi } from '../../../services/api/endpoints/analyticsApi';

/** Payment settlement outcomes (captured/pending/failed/refunded) and the success-rate trend. */
export const usePaymentsStatus = (range) =>
    useQuery(async () => (await analyticsApi.getPaymentsStatus(range)).data, { deps: [range] });

export default usePaymentsStatus;
