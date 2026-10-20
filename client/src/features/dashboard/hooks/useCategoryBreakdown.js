import useQuery from '../../../hooks/useQuery';
import { analyticsApi } from '../../../services/api/endpoints/analyticsApi';

/** Spend ranked by category, with each category's trend vs the previous period. */
export const useCategoryBreakdown = (range) =>
    useQuery(async () => (await analyticsApi.getCategories(range)).data, { deps: [range], key: `dashboard:categories:${range}` });

export default useCategoryBreakdown;
