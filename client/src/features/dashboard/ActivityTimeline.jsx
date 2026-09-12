import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Receipt } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card';
import { SkeletonRows } from '../../components/ui/Skeleton';
import EmptyState from '../../components/feedback/EmptyState';
import Button from '../../components/ui/Button';
import { ListGroupHeader } from '../../components/ui/List';
import TransactionRow from '../transactions/TransactionRow';
import { ROUTES } from '../../constants/routes';
import { groupByDay } from '../../utils/formatters';

/**
 * Chart 8 — recent financial activity.
 *
 * Sourced from the same bounded `recentTransactions` the app already keeps
 * live in `AuthContext` (socket-updated on every transfer/top-up) — no
 * separate fetch, just a richer, grouped presentation of data the dashboard
 * was already holding.
 */
const ActivityTimeline = ({ transactions, loading, onSelect }) => {
    const hasActivity = (transactions?.length ?? 0) > 0;
    const groups = groupByDay(transactions ?? []);

    return (
        <Card padding="sm">
            <div className="px-2 pt-1 sm:px-1">
                <CardHeader
                    title="Recent activity"
                    action={
                        hasActivity && (
                            <Link
                                to={ROUTES.ACTIVITY}
                                className="inline-flex items-center gap-1 rounded-control px-2 py-1 text-sm font-medium text-accent-text hover:bg-surface-hover"
                            >
                                See all
                                <ArrowRight size={14} aria-hidden="true" />
                            </Link>
                        )
                    }
                />
            </div>

            {loading ? (
                <SkeletonRows count={5} />
            ) : hasActivity ? (
                <ul className="mt-1">
                    {groups.map((group) => (
                        <React.Fragment key={group.key}>
                            <ListGroupHeader>{group.label}</ListGroupHeader>
                            {group.items.map((transaction) => (
                                <TransactionRow
                                    key={transaction._id}
                                    transaction={transaction}
                                    onSelect={onSelect}
                                />
                            ))}
                        </React.Fragment>
                    ))}
                </ul>
            ) : (
                <EmptyState
                    variant="first-run"
                    icon={<Receipt size={20} />}
                    title="No activity yet"
                    description="Add money to your wallet, then send your first transfer. Everything you do will appear here."
                    action={
                        <Link to={ROUTES.ADD_MONEY}>
                            <Button variant="primary">Add money</Button>
                        </Link>
                    }
                />
            )}
        </Card>
    );
};

export default ActivityTimeline;
