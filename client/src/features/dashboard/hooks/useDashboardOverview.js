import useQuery from '../../../hooks/useQuery';
import { analyticsApi } from '../../../services/api/endpoints/analyticsApi';

/** Money in/out, net cash flow and the transaction-count KPIs, plus the time series behind the hero and cash-flow charts. */
export const useDashboardOverview = (range) =>
    useQuery(async () => (await analyticsApi.getOverview(range)).data, { deps: [range], key: `dashboard:overview:${range}` });

export default useDashboardOverview;
