import React, { useId } from 'react';
import { Users } from 'lucide-react';
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import Card, { CardHeader } from '../../components/ui/Card';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import ChartDataTable from '../../components/ui/ChartDataTable';
import { formatCurrencyCompact, formatNumber } from '../../utils/formatters';
import { formatAxisDate, formatTooltipDate } from './dashboardFormat';
import {
    AREA_FILL_OPACITY, activeDot, gridProps, lineCursor,
    SERIES_STROKE_WIDTH, VIZ_SERIES, xAxisProps, yAxisProps,
} from '../../lib/chartTheme';

/**
 * Slot 4 — the emerald end of the brand gradient — rather than the primary
 * cyan, so this card is distinguishable at a glance from the net-cash-flow
 * hero above it while staying inside the same family. It was drawn in
 * `--color-ai` before, which is the violet reserved for AI-generated content.
 */
const SERIES_COLOR = VIZ_SERIES[3];

/**
 * Chart 6 — network growth.
 *
 * The closest real, decision-useful analogue this wallet has to a business's
 * user-growth chart: how many distinct people you've ever sent money to, and
 * whether that circle is still expanding. Paired with who you actually
 * transact with most, which the growth curve alone can't say.
 */
const NetworkGrowthChart = ({ network, loading, error, onRetry, range }) => {
    const gradientId = useId();

    if (error) {
        return (
            <Card>
                <ErrorState title="Network growth unavailable" message={error} onRetry={onRetry} />
            </Card>
        );
    }

    const series = network?.series ?? [];
    const topRecipients = network?.topRecipients ?? [];
    const hasNetwork = (network?.totalNetwork ?? 0) > 0;

    return (
        <Card>
            <CardHeader title="Network growth" description="People you've sent money to, over time" />

            <div className="mt-4 h-48 w-full">
                {loading ? (
                    <Skeleton className="h-full w-full" rounded="rounded-card" />
                ) : !hasNetwork ? (
                    <EmptyState
                        variant="first-run"
                        icon={<Users size={20} />}
                        title="No transfers yet"
                        description="Send money to someone and they'll start showing up here."
                    />
                ) : (
                    <div className="h-full w-full" aria-hidden="true">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                                <defs>
                                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={SERIES_COLOR} stopOpacity={AREA_FILL_OPACITY.top} />
                                        <stop offset="100%" stopColor={SERIES_COLOR} stopOpacity={AREA_FILL_OPACITY.bottom} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid {...gridProps} />
                                <XAxis
                                    dataKey="date"
                                    tickFormatter={(value) => formatAxisDate(value, range)}
                                    {...xAxisProps}
                                />
                                <YAxis allowDecimals={false} {...yAxisProps} width={28} />
                                <Tooltip cursor={lineCursor} content={<NetworkTooltip range={range} />} />
                                <Area
                                    type="monotone"
                                    dataKey="cumulative"
                                    name="People reached"
                                    stroke={SERIES_COLOR}
                                    strokeWidth={SERIES_STROKE_WIDTH}
                                    fill={`url(#${gradientId})`}
                                    activeDot={activeDot}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            {!loading && hasNetwork && (
                <ChartDataTable
                    caption={`People you have sent money to, cumulative, ${range}`}
                    rows={series}
                    columns={[
                        { key: 'date', header: 'Period', render: (p) => formatTooltipDate(p.date, range) },
                        { key: 'cumulative', header: 'People reached', render: (p) => formatNumber(p.cumulative) },
                    ]}
                />
            )}

            {!loading && topRecipients.length > 0 && (
                <div className="mt-4 border-t border-border pt-3">
                    <p className="text-xs font-medium text-text-muted">Top recipients</p>
                    <ul className="mt-2 space-y-2">
                        {topRecipients.map((recipient) => (
                            <li key={recipient.recipientId} className="flex items-center justify-between gap-3 text-sm">
                                <span className="truncate text-text">{recipient.name}</span>
                                <span className="shrink-0 text-text-muted">
                                    <span className="font-medium tabular-nums text-text">
                                        {formatCurrencyCompact(recipient.totalSent)}
                                    </span>
                                    {' · '}
                                    {formatNumber(recipient.count)} {recipient.count === 1 ? 'transfer' : 'transfers'}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </Card>
    );
};

const NetworkTooltip = ({ active, payload, label, range }) => {
    if (!active || !payload?.length) return null;
    const point = payload[0]?.payload;
    if (!point) return null;

    return (
        <div className="rounded-control border border-border bg-overlay px-3 py-2 shadow-overlay">
            <p className="text-xs text-text-muted">{formatTooltipDate(label, range)}</p>
            <p className="mt-0.5 text-sm font-semibold text-text">{formatNumber(point.cumulative)} people</p>
            {point.newRecipients > 0 && (
                <p className="text-xs text-positive">+{point.newRecipients} new</p>
            )}
        </div>
    );
};

export default NetworkGrowthChart;
