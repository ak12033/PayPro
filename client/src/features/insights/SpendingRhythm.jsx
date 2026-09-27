import React from 'react';
import { CalendarClock } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card';
import Skeleton from '../../components/ui/Skeleton';
import ChartDataTable from '../../components/ui/ChartDataTable';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import { formatCurrencyCompact } from '../../utils/formatters';
import { WEEKDAY_NAMES, busiestHour, formatHour, heatLevel, HEAT_LEVELS } from './rhythmScale';

/**
 * When in the week money goes out (plan.md §17.2's day/hour heatmap).
 *
 * One hue at rising strength, not a rainbow: this is a single quantity, so the
 * encoding is lightness on `--color-viz-1`, the primary chart slot — adding a
 * colour to the validated viz palette is exactly what context.md §6.3 forbids.
 * Levels are relative to this person's own busiest hour, so a light spender
 * still sees a pattern rather than a pale grid.
 *
 * The grid is `aria-hidden`; the sentence above it and the per-day table below
 * carry the same information as text (§37.2 req. 3). A 168-cell table read
 * aloud would be accurate and useless, so the table summarises each day.
 */
const SpendingRhythm = ({ data, loading, error, onRetry }) => {
    if (loading) {
        return (
            <Card>
                <Skeleton className="h-52 w-full" rounded="rounded-card" />
            </Card>
        );
    }

    if (error) {
        return (
            <Card>
                <ErrorState title="Spending pattern unavailable" message={error} onRetry={onRetry} />
            </Card>
        );
    }

    if (!data || data.transactionCount === 0) {
        return (
            <Card>
                <CardHeader title="When you spend" />
                <EmptyState
                    variant="first-run"
                    icon={<CalendarClock size={20} />}
                    title="No pattern yet"
                    description="Once you've sent or spent money for a while, you'll see which days and hours it tends to go out."
                />
            </Card>
        );
    }

    const max = data.peak?.amount ?? 0;
    const busiestDay = data.byDay.indexOf(Math.max(...data.byDay));

    const rows = WEEKDAY_NAMES.map((name, day) => ({
        name,
        spent: data.byDay[day],
        count: data.counts[day].reduce((a, b) => a + b, 0),
        hour: busiestHour(data.amounts[day]),
    }));

    return (
        <Card>
            <CardHeader
                title="When you spend"
                description="Last 3 months, by day and hour (India time)"
            />

            <p className="mt-2 text-sm leading-6 text-text-secondary">
                Most of your spending lands on <strong className="font-semibold text-text">{WEEKDAY_NAMES[busiestDay]}s</strong>
                {data.peak && (
                    <>
                        , and your single busiest hour is {WEEKDAY_NAMES[data.peak.day]} around{' '}
                        <strong className="font-semibold text-text">{formatHour(data.peak.hour)}</strong>
                    </>
                )}
                .
            </p>

            <div className="mt-4 overflow-x-auto" aria-hidden="true">
                <div className="grid min-w-[34rem] grid-cols-[2.5rem_repeat(24,minmax(0,1fr))] gap-[3px]">
                    <span />
                    {Array.from({ length: 24 }, (_, hour) => (
                        <span key={hour} className="text-center text-[10px] leading-4 text-text-muted">
                            {hour % 6 === 0 ? formatHour(hour, { short: true }) : ''}
                        </span>
                    ))}

                    {data.days.map((label, day) => (
                        <React.Fragment key={label}>
                            <span className="pr-1 text-right text-[11px] leading-5 text-text-muted">{label}</span>
                            {data.amounts[day].map((amount, hour) => (
                                <span
                                    key={hour}
                                    title={`${label} ${formatHour(hour)}: ${formatCurrencyCompact(amount)}`}
                                    className="h-5 rounded-[3px]"
                                    style={cellStyle(heatLevel(amount, max))}
                                />
                            ))}
                        </React.Fragment>
                    ))}
                </div>
            </div>

            <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-text-muted" aria-hidden="true">
                <span>Less</span>
                {Array.from({ length: HEAT_LEVELS + 1 }, (_, level) => (
                    <span key={level} className="h-3 w-3 rounded-[3px]" style={cellStyle(level)} />
                ))}
                <span>More</span>
            </div>

            <ChartDataTable
                caption="Spending by day of the week, last 3 months"
                rows={rows}
                rowKey={(row) => row.name}
                columns={[
                    { key: 'name', header: 'Day', render: (row) => row.name },
                    { key: 'spent', header: 'Spent', render: (row) => formatCurrencyCompact(row.spent) },
                    { key: 'count', header: 'Payments', render: (row) => row.count },
                    { key: 'hour', header: 'Busiest hour', render: (row) => (row.hour === null ? '—' : formatHour(row.hour)) },
                ]}
            />
        </Card>
    );
};

/** Level 0 is an empty cell; 1..HEAT_LEVELS mix the primary viz colour in at rising strength. */
const cellStyle = (level) => ({
    backgroundColor: level === 0
        ? 'var(--color-surface-sunken)'
        : `color-mix(in srgb, var(--color-viz-1) ${Math.round((level / HEAT_LEVELS) * 100)}%, var(--color-surface-sunken))`,
});

export default SpendingRhythm;
