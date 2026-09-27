import React from 'react';
import { RefreshCcw } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card';
import List from '../../components/ui/List';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import { SkeletonRows } from '../../components/ui/Skeleton';
import RecurringRow from './RecurringRow';
import { RECURRING_DISCLAIMER } from '../../constants/recurring';

/**
 * Detected recurring payments (plan.md §18.3).
 *
 * The heading says "Looks like repeat payments", not "Your subscriptions", and
 * the disclaimer below it is not optional decoration — it is the difference
 * between a heuristic honestly labelled and a product claiming to know
 * something it inferred. Every row can be dismissed, which is what makes the
 * claim falsifiable by the only person who actually knows.
 */
const RecurringList = ({ query, onDismiss, onDetect, detecting }) => {
    const items = query.data ?? [];

    return (
        <Card>
            <CardHeader
                title="Looks like repeat payments"
                action={
                    onDetect && (
                        <Button
                            variant="ghost"
                            size="sm"
                            icon={<RefreshCcw size={14} />}
                            onClick={onDetect}
                            loading={detecting}
                        >
                            Check now
                        </Button>
                    )
                }
            />

            <p className="mb-3 text-xs leading-5 text-text-muted">{RECURRING_DISCLAIMER}</p>

            {query.loading && <SkeletonRows count={3} />}

            {query.error && <ErrorState message={query.error} onRetry={query.retry} />}

            {!query.loading && !query.error && items.length === 0 && (
                <EmptyState
                    icon={<RefreshCcw size={20} />}
                    title="Nothing repeating yet"
                    description="Once the same payment shows up three times or so, it'll appear here."
                />
            )}

            {items.length > 0 && (
                <List>
                    {items.map((item) => (
                        <RecurringRow key={item._id} item={item} onDismiss={onDismiss} />
                    ))}
                </List>
            )}
        </Card>
    );
};

export default RecurringList;
