import React from 'react';
import Card, { CardHeader } from '../../components/ui/Card';
import Amount from '../../components/ui/Amount';
import Skeleton from '../../components/ui/Skeleton';
import ErrorState from '../../components/feedback/ErrorState';
import { toRupees } from '../../constants/budget';

/**
 * Period totals for cash flow (plan.md §16.3) — distinct from `CashFlowChart`,
 * which plots the series. This is the "what happened this period" summary:
 * income vs money-in (not the same number, see §16.1), expenses, net, savings
 * rate, and the fixed/variable/savings split.
 */
const Tile = ({ label, value, tone }) => (
    <div>
        <p className="text-xs text-text-muted">{label}</p>
        <div className="mt-1">
            <Amount value={value} size="lg" showFraction={false} tone={tone} />
        </div>
    </div>
);

const CashFlowSummary = ({ data, loading, error, onRetry }) => {
    if (loading) {
        return (
            <Card>
                <Skeleton className="h-32 w-full" rounded="rounded-card" />
            </Card>
        );
    }

    if (error) {
        return (
            <Card>
                <ErrorState title="Cash flow unavailable" message={error} onRetry={onRetry} />
            </Card>
        );
    }

    const { summary, breakdown } = data ?? { summary: {}, breakdown: {} };

    return (
        <Card>
            <CardHeader
                title="Cash flow"
                description="Income is money you earned; money in also includes top-ups."
            />

            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Tile label="Income" value={toRupees(summary.incomeMinor)} tone="positive" />
                <Tile label="Money in" value={toRupees(summary.moneyInMinor)} />
                <Tile label="Expenses" value={toRupees(summary.expensesMinor)} tone="negative" />
                <Tile label="Net" value={toRupees(summary.netMinor)} />
            </div>

            <p className="mt-4 text-xs text-text-muted">
                Savings rate: <span className="font-medium text-text">{summary.savingsRatePct ?? 0}%</span>
                {' · '}Fixed ₹{toRupees(breakdown.fixedMinor).toFixed(0)} · Variable ₹{toRupees(breakdown.variableMinor).toFixed(0)} · Savings ₹{toRupees(breakdown.savingsMinor).toFixed(0)}
            </p>
        </Card>
    );
};

export default CashFlowSummary;
