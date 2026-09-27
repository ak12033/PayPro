import React from 'react';
import { Store } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card';
import List, { ListRow } from '../../components/ui/List';
import Amount from '../../components/ui/Amount';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import { amountMinorOf } from '../../lib/money';

/** Spend grouped by merchant/counterparty (plan.md §17.2). */
const MerchantBreakdown = ({ merchants, loading, error, onRetry }) => {
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
                <ErrorState title="Merchants unavailable" message={error} onRetry={onRetry} />
            </Card>
        );
    }

    return (
        <Card padding={merchants?.length ? 'none' : 'lg'}>
            <div className="p-4 pb-0">
                <CardHeader title="Top merchants" />
            </div>

            {merchants?.length ? (
                <List className="mt-2">
                    {merchants.map((m) => (
                        <ListRow
                            key={m.merchant}
                            title={m.merchant}
                            subtitle={`${m.count} transaction${m.count === 1 ? '' : 's'}`}
                            trailing={<Amount minor={amountMinorOf(m)} size="sm" showFraction={false} direction="out" />}
                        />
                    ))}
                </List>
            ) : (
                <EmptyState
                    variant="first-run"
                    icon={<Store size={20} />}
                    title="No merchant spend yet"
                    description="Payments to a merchant or external payee will show up here."
                />
            )}
        </Card>
    );
};

export default MerchantBreakdown;
