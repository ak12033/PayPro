import React from 'react';
import { ArrowLeftRight } from 'lucide-react';
import {
    ComposedChart, Bar, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import Card, { CardHeader } from '../../components/ui/Card';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import ChartDataTable from '../../components/ui/ChartDataTable';
import { formatCurrencyCompact } from '../../utils/formatters';
import { formatAxisDate, formatTooltipDate } from './dashboardFormat';
import {
    activeDot, barCursor, BAR_MAX_WIDTH, BAR_RADIUS, gridProps,
    SERIES_STROKE_WIDTH, VIZ_PRIMARY, xAxisProps, yAxisProps,
} from '../../lib/chartTheme';

/**
 * Chart 2 — where money came from and where it went.
 *
 * Money in and money out share one axis (both are amounts of the same
 * currency); net rides the same axis as a line rather than getting a second
 * scale, so nothing here can invent a correlation the data doesn't have.
 *
 * The two bars are the one place on the dashboard that deliberately does NOT
 * take the teal visualization ramp. `--color-positive` and `--color-negative`
 * are not decoration here: they are the same two tokens `Amount`,
 * `TransactionRow` and every balance in the product use to mean money-in and
 * money-out. Recolouring them into two shades of teal would make this chart
 * the only surface in the app where a credit and a debit are told apart by
 * lightness alone, and it would disagree with the ledger sitting one screen
 * away. The *net* line does take the ramp's primary, because "net" has no
 * direction until you read its sign.
 */
const CashFlowChart = ({ overview, loading, error, onRetry, range }) => {
    if (error) {
        return (
            <Card>
                <ErrorState title="Cash flow unavailable" message={error} onRetry={onRetry} />
            </Card>
        );
    }

    const series = overview?.series ?? [];
    const hasActivity = series.some((point) => point.moneyIn > 0 || point.moneyOut > 0);

    return (
        <Card>
            <CardHeader title="Cash flow" description="Income, expenses and the difference between them" />

            <div className="mt-4 h-64 w-full">
                {loading ? (
                    <div className="skeleton h-full w-full rounded-card" aria-hidden="true" />
                ) : !hasActivity ? (
                    <EmptyState
                        variant="first-run"
                        icon={<ArrowLeftRight size={20} />}
                        title="Nothing to compare yet"
                        description="Your income and expenses will be plotted here side by side once you have some activity."
                    />
                ) : (
                    <div className="h-full w-full" aria-hidden="true">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
                                <CartesianGrid {...gridProps} />
                                <XAxis
                                    dataKey="date"
                                    tickFormatter={(value) => formatAxisDate(value, range)}
                                    {...xAxisProps}
                                />
                                <YAxis
                                    tickFormatter={formatCurrencyCompact}
                                    {...yAxisProps}
                                    width={64}
                                />
                                <Tooltip cursor={barCursor} content={<CashFlowTooltip range={range} />} />
                                <Legend
                                    iconType="circle"
                                    iconSize={8}
                                    wrapperStyle={{ fontSize: 12, color: 'var(--color-viz-label)' }}
                                />
                                <Bar
                                    dataKey="moneyIn"
                                    name="Money in"
                                    fill="var(--color-positive)"
                                    radius={BAR_RADIUS}
                                    maxBarSize={BAR_MAX_WIDTH}
                                />
                                <Bar
                                    dataKey="moneyOut"
                                    name="Money out"
                                    fill="var(--color-negative)"
                                    radius={BAR_RADIUS}
                                    maxBarSize={BAR_MAX_WIDTH}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="net"
                                    name="Net"
                                    stroke={VIZ_PRIMARY}
                                    strokeWidth={SERIES_STROKE_WIDTH}
                                    dot={false}
                                    activeDot={activeDot}
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            {!loading && hasActivity && (
                <ChartDataTable
                    caption={`Money in, money out and net by period, ${range}`}
                    rows={series}
                    columns={[
                        { key: 'date', header: 'Period', render: (p) => formatTooltipDate(p.date, range) },
                        { key: 'in', header: 'Money in', render: (p) => formatCurrencyCompact(p.moneyIn) },
                        { key: 'out', header: 'Money out', render: (p) => formatCurrencyCompact(p.moneyOut) },
                        { key: 'net', header: 'Net', render: (p) => formatCurrencyCompact(p.net) },
                    ]}
                />
            )}
        </Card>
    );
};

const CashFlowTooltip = ({ active, payload, label, range }) => {
    if (!active || !payload?.length) return null;
    const point = payload[0]?.payload;
    if (!point) return null;

    return (
        <div className="rounded-control border border-border bg-overlay px-3 py-2 shadow-overlay">
            <p className="text-xs text-text-muted">{formatTooltipDate(label, range)}</p>
            <p className="mt-1 text-xs text-positive">Money in {formatCurrencyCompact(point.moneyIn)}</p>
            <p className="text-xs text-negative">Money out {formatCurrencyCompact(point.moneyOut)}</p>
            <p className="mt-1 text-xs font-semibold text-text">Net {formatCurrencyCompact(point.net)}</p>
        </div>
    );
};

export default CashFlowChart;
