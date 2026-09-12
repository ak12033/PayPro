import React, { useId } from 'react';
import { TrendingUp, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import cn from '../../lib/cn';
import Card, { CardHeader } from '../../components/ui/Card';
import Amount from '../../components/ui/Amount';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import { formatCurrencyCompact } from '../../utils/formatters';
import { formatAxisDate, formatTooltipDate } from './dashboardFormat';
import {
    AREA_FILL_OPACITY, activeDot, gridProps, lineCursor,
    SERIES_STROKE_WIDTH, VIZ_PRIMARY, xAxisProps, yAxisProps,
} from '../../lib/chartTheme';

/**
 * Chart 1 — the hero figure.
 *
 * Net cash flow (money in minus money out) is the one number that answers
 * "am I, overall, ahead or behind" for the selected period — the closest
 * analogue this wallet has to a company's headline performance line.
 */
const PerformanceHero = ({ overview, loading, error, onRetry, range }) => {
    const gradientId = useId();

    if (error) {
        return (
            <Card>
                <ErrorState title="Performance unavailable" message={error} onRetry={onRetry} />
            </Card>
        );
    }

    const summary = overview?.summary;
    const series = overview?.series ?? [];
    const hasActivity = series.some((point) => point.moneyIn > 0 || point.moneyOut > 0);

    return (
        <Card>
            <CardHeader
                title="Net cash flow"
                description="Money in minus money out, over time"
                action={
                    !loading && summary && (
                        <span
                            className={cn(
                                'inline-flex items-center gap-1 rounded-control px-2 py-1 text-xs font-semibold',
                                summary.growthPct > 0
                                    ? 'bg-positive-soft text-positive'
                                    : summary.growthPct < 0
                                        ? 'bg-negative-soft text-negative'
                                        : 'bg-surface-sunken text-text-muted'
                            )}
                        >
                            {summary.growthPct > 0 ? (
                                <ArrowUpRight size={13} aria-hidden="true" />
                            ) : summary.growthPct < 0 ? (
                                <ArrowDownRight size={13} aria-hidden="true" />
                            ) : (
                                <Minus size={13} aria-hidden="true" />
                            )}
                            {Math.abs(summary.growthPct).toFixed(1)}%
                        </span>
                    )
                }
            />

            {!loading && summary && (
                <div className="mt-3 flex items-baseline gap-3">
                    <Amount
                        value={summary.netCashFlow}
                        direction={summary.netCashFlow >= 0 ? 'in' : 'out'}
                        size="display"
                        showFraction={false}
                    />
                    <span className="text-xs text-text-muted">vs previous period</span>
                </div>
            )}

            <div className="mt-5 h-64 w-full">
                {loading ? (
                    <div className="skeleton h-full w-full rounded-card" aria-hidden="true" />
                ) : !hasActivity ? (
                    <EmptyState
                        variant="first-run"
                        icon={<TrendingUp size={20} />}
                        title="No activity yet"
                        description="Once money moves in or out of your wallet, your performance will appear here."
                    />
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                            <defs>
                                {/* The hero chart carries the primary series colour —
                                    the same value as the Send button. */}
                                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={VIZ_PRIMARY} stopOpacity={AREA_FILL_OPACITY.top} />
                                    <stop offset="100%" stopColor={VIZ_PRIMARY} stopOpacity={AREA_FILL_OPACITY.bottom} />
                                </linearGradient>
                            </defs>
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
                            <Tooltip cursor={lineCursor} content={<HeroTooltip range={range} />} />
                            <Area
                                type="monotone"
                                dataKey="net"
                                stroke={VIZ_PRIMARY}
                                strokeWidth={SERIES_STROKE_WIDTH}
                                fill={`url(#${gradientId})`}
                                activeDot={activeDot}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>
        </Card>
    );
};

const HeroTooltip = ({ active, payload, label, range }) => {
    if (!active || !payload?.length) return null;
    const point = payload[0]?.payload;
    if (!point) return null;

    return (
        <div className="rounded-control border border-border bg-overlay px-3 py-2 shadow-overlay">
            <p className="text-xs text-text-muted">{formatTooltipDate(label, range)}</p>
            <p className="mt-0.5 text-sm font-semibold text-text">{formatCurrencyCompact(point.net)} net</p>
            <p className="mt-1 text-xs text-positive">In {formatCurrencyCompact(point.moneyIn)}</p>
            <p className="text-xs text-negative">Out {formatCurrencyCompact(point.moneyOut)}</p>
        </div>
    );
};

export default PerformanceHero;
