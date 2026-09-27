import React, { useId } from 'react';
import { ArrowUpRight, ArrowDownRight, Minus, ShieldCheck } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import cn from '../../lib/cn';
import Card, { CardHeader } from '../../components/ui/Card';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import ChartDataTable from '../../components/ui/ChartDataTable';
import { formatDate } from '../../utils/formatters';
import { AREA_FILL_OPACITY, SPARKLINE_STROKE_WIDTH, VIZ_SERIES } from '../../lib/chartTheme';

/**
 * Slot 3 — the light teal — so this sparkline reads as its own series next to
 * the primary-cyan tiles rather than merging with them. It was drawn in
 * `--color-positive` before, which implied the *line* encoded good-vs-bad; it
 * doesn't, it only shows shape. The figure above it and its delta arrow are
 * what carry the judgement, and those keep their semantic colours.
 */
const SERIES_COLOR = VIZ_SERIES[2];

/**
 * Chart 7 — payment success rate.
 *
 * A single ratio against an implicit 100% ceiling is a stat tile, not a
 * chart in its own right (per the "is it even a chart?" heuristic) — the
 * hero figure carries the number, and the sparkline carries only its recent
 * shape, deliberately without axes or gridlines competing for attention.
 */
const SuccessRateKpi = ({ paymentsStatus, loading, error, onRetry }) => {
    const gradientId = useId();

    if (error) {
        return (
            <Card>
                <ErrorState title="Success rate unavailable" message={error} onRetry={onRetry} />
            </Card>
        );
    }

    const summary = paymentsStatus?.summary;
    const decided = summary ? summary.captured + summary.failed : 0;
    const ratedPoints = (paymentsStatus?.series ?? [])
        .filter((point) => point.successRate !== null && point.successRate !== undefined);
    const sparkline = ratedPoints.map((point) => point.successRate);

    const changePct = summary?.successRateChangePct;
    const hasChange = changePct !== null && changePct !== undefined;
    const isFlat = hasChange && Math.abs(changePct) < 0.5;
    const isGood = hasChange && !isFlat && changePct > 0;

    return (
        <Card>
            <CardHeader title="Payment success rate" description="Captured vs. failed payments this period" />

            <div className="mt-3">
                {loading ? (
                    <Skeleton className="h-10 w-28" />
                ) : decided === 0 ? (
                    <EmptyState
                        variant="first-run"
                        icon={<ShieldCheck size={20} />}
                        title="No payments to measure yet"
                        description="Add money to your wallet and this will show how reliably it goes through."
                    />
                ) : (
                    <>
                        <p className="text-3xl font-semibold tabular-nums text-text sm:text-4xl">
                            {summary.successRate.toFixed(1)}
                            <span className="text-xl text-text-muted">%</span>
                        </p>

                        {hasChange && (
                            <div
                                className={cn(
                                    'mt-1.5 inline-flex items-center gap-1 text-xs font-medium',
                                    isFlat ? 'text-text-muted' : isGood ? 'text-positive' : 'text-negative'
                                )}
                            >
                                {isFlat ? (
                                    <Minus size={13} aria-hidden="true" />
                                ) : changePct > 0 ? (
                                    <ArrowUpRight size={13} aria-hidden="true" />
                                ) : (
                                    <ArrowDownRight size={13} aria-hidden="true" />
                                )}
                                <span>{Math.abs(changePct).toFixed(1)} pts</span>
                                <span className="text-text-muted">vs previous period</span>
                            </div>
                        )}

                        {sparkline.length > 1 && (
                            <div className="mt-4 h-14 w-full" aria-hidden="true">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart
                                        data={sparkline.map((v) => ({ v }))}
                                        margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                                    >
                                        <defs>
                                            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor={SERIES_COLOR} stopOpacity={AREA_FILL_OPACITY.top} />
                                                <stop offset="100%" stopColor={SERIES_COLOR} stopOpacity={AREA_FILL_OPACITY.bottom} />
                                            </linearGradient>
                                        </defs>
                                        <Area
                                            type="monotone"
                                            dataKey="v"
                                            stroke={SERIES_COLOR}
                                            strokeWidth={SPARKLINE_STROKE_WIDTH}
                                            fill={`url(#${gradientId})`}
                                            isAnimationActive={false}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        {ratedPoints.length > 1 && (
                            <ChartDataTable
                                caption="Payment success rate by period"
                                rows={ratedPoints}
                                columns={[
                                    { key: 'date', header: 'Period', render: (p) => formatDate(p.date) },
                                    { key: 'rate', header: 'Success rate', render: (p) => `${p.successRate}%` },
                                ]}
                            />
                        )}
                    </>
                )}
            </div>
        </Card>
    );
};

export default SuccessRateKpi;
