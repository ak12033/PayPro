import React from 'react';
import { TrendingDown } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card';
import List, { ListRow } from '../../components/ui/List';
import Amount from '../../components/ui/Amount';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import { formatDate } from '../../utils/formatters';
import { amountMinorOf } from '../../lib/money';

/** The largest individual debits in a range (plan.md §17.2). */
const TopExpenses = ({ transactions, loading, error, onRetry }) => {
    if (loading) {
        return (
            <Card>
                <Skeleton className="h-48 w-full" rounded="rounded-card" />
            </Card>
        );
    }

    if (error) {
        return (
            <Card>
                <ErrorState title="Top expenses unavailable" message={error} onRetry={onRetry} />
            </Card>
        );
    }

    return (
        <Card padding={transactions?.length ? 'none' : 'lg'}>
            <div className="p-4 pb-0">
                <CardHeader title="Largest expenses" />
            </div>

            {transactions?.length ? (
                <List className="mt-2">
                    {transactions.map((t) => (
                        <ListRow
                            key={t._id}
                            title={t.description}
                            subtitle={`${t.category} · ${formatDate(t.postedAt)}`}
                            trailing={<Amount minor={amountMinorOf(t)} size="sm" showFraction={false} direction="out" />}
                        />
                    ))}
                </List>
            ) : (
                <EmptyState
                    variant="first-run"
                    icon={<TrendingDown size={20} />}
                    title="Nothing large yet"
                    description="Your biggest individual payments for this range will appear here."
                />
            )}
        </Card>
    );
};

export default TopExpenses;
