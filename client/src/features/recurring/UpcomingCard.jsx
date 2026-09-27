import React from 'react';
import { CalendarClock } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card';
import Amount from '../../components/ui/Amount';
import List from '../../components/ui/List';
import { SkeletonRows } from '../../components/ui/Skeleton';
import RecurringRow from './RecurringRow';

/**
 * What is expected to go out in the next 30 days (plan.md §18.3).
 *
 * A forecast, phrased as one. The total is "about", the items are the ones the
 * detector found, and neither claims completeness — a subscription paid on a
 * card PayPro never sees is invisible here, and implying otherwise would make
 * the number worse than useless for planning.
 */
const UpcomingCard = ({ query, days = 30 }) => {
    const data = query.data;
    const items = data?.items ?? [];

    // Nothing found is not worth a card of its own on a busy page; the
    // dedicated Bills screen has the empty state that explains why.
    if (!query.loading && items.length === 0) return null;

    return (
        <Card>
            <CardHeader
                title={`Expected in the next ${days} days`}
                description="Based on payments that have repeated before."
            />

            {query.loading ? (
                <SkeletonRows count={2} />
            ) : (
                <>
                    <p className="mt-2 text-sm text-text-muted">
                        About{' '}
                        <Amount minor={data.totalMinor} size="sm" showFraction={false} />{' '}
                        across {items.length} payment{items.length === 1 ? '' : 's'}.
                    </p>

                    <List className="mt-2">
                        {items.map((item) => (
                            <RecurringRow key={item._id} item={item} />
                        ))}
                    </List>
                </>
            )}
        </Card>
    );
};

export default UpcomingCard;
