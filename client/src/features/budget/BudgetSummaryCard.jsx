import React from 'react';
import { Link } from 'react-router-dom';
import { PiggyBank, ArrowRight } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card';
import Amount from '../../components/ui/Amount';
import ProgressBar from '../../components/ui/ProgressBar';
import Skeleton from '../../components/ui/Skeleton';
import Button from '../../components/ui/Button';
import ErrorState from '../../components/feedback/ErrorState';
import { toRupees } from '../../constants/budget';

/**
 * The overall-budget summary. Used both on `Home.jsx` (compact, one card
 * below the KPI row per plan.md §17.3) and at the top of `pages/insights/Budgets.jsx`
 * (full, with the projection line and a link into category detail).
 */
const BudgetSummaryCard = ({ data, loading, error, onRetry, compact = false, onCreate }) => {
    if (loading) {
        return (
            <Card>
                <Skeleton className="h-20 w-full" rounded="rounded-card" />
            </Card>
        );
    }

    if (error) {
        return (
            <Card>
                <ErrorState title="Budget unavailable" message={error} onRetry={onRetry} reassurance={null} />
            </Card>
        );
    }

    if (!data) {
        return (
            <Card>
                <div className="flex items-start gap-3">
                    <span
                        aria-hidden="true"
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-text"
                    >
                        <PiggyBank size={17} />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-text">No budget set for this month</p>
                        <p className="mt-0.5 text-xs leading-5 text-text-muted">
                            Set a monthly limit to see how your spending is tracking.
                        </p>
                        {onCreate && (
                            <Button variant="secondary" size="sm" className="mt-3" onClick={onCreate}>
                                Create a budget
                            </Button>
                        )}
                    </div>
                </div>
            </Card>
        );
    }

    const { budget, spend, remaining, projection } = data;
    const hasTotal = budget.totalLimitMinor != null;

    return (
        <Card>
            {!compact && <CardHeader title="Budget" description={budget.period} />}

            {hasTotal ? (
                <>
                    <div className="flex items-baseline justify-between gap-2">
                        <Amount minor={spend.totalMinor} size={compact ? 'lg' : 'xl'} showFraction={false} />
                        <span className="text-sm text-text-muted">
                            of <Amount minor={budget.totalLimitMinor} size="sm" showFraction={false} tone="muted" />
                        </span>
                    </div>

                    <ProgressBar
                        className="mt-3"
                        value={spend.totalMinor}
                        max={budget.totalLimitMinor}
                        label={`Monthly budget: ${(spend.totalMinor / 100).toFixed(2)} of ${(budget.totalLimitMinor / 100).toFixed(2)} rupees spent`}
                    />

                    <p className="mt-2 text-xs text-text-muted">
                        {remaining.totalMinor >= 0
                            ? `₹${toRupees(remaining.totalMinor).toFixed(2)} left · ${remaining.daysLeft} day${remaining.daysLeft === 1 ? '' : 's'} left`
                            : `₹${Math.abs(toRupees(remaining.totalMinor)).toFixed(2)} over budget`}
                    </p>

                    {!compact && projection?.willExceed && (
                        <p className="mt-2 rounded-control bg-warning-soft px-3 py-2 text-xs text-warning">
                            Projection: at your current rate you'll finish this period around{' '}
                            ₹{toRupees(projection.projectedTotalMinor).toFixed(2)} — over your budget.
                        </p>
                    )}
                </>
            ) : (
                <p className="text-sm text-text-muted">
                    Spent <Amount minor={spend.totalMinor} size="sm" showFraction={false} /> so far this month —
                    set an overall limit to track progress against it.
                </p>
            )}

            {compact && (
                <Link
                    to="/insights/budgets"
                    className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent-text hover:underline"
                >
                    View budget <ArrowRight size={12} aria-hidden="true" />
                </Link>
            )}
        </Card>
    );
};

export default BudgetSummaryCard;
