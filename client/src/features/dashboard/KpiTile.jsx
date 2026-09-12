import React, { useId } from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import cn from '../../lib/cn';
import Card from '../../components/ui/Card';
import Skeleton from '../../components/ui/Skeleton';
import { formatCurrencyCompact, formatNumber } from '../../utils/formatters';
import { AREA_FILL_OPACITY, SPARKLINE_STROKE_WIDTH, VIZ_PRIMARY } from '../../lib/chartTheme';

/**
 * One executive-overview number: current value, direction of travel, and a
 * sparkline for shape — never just a bare figure, since "up 4%" and "up 4%
 * after being down all week" are different facts.
 */
const KpiTile = ({
    label,
    value,
    format = 'currency',
    deltaPct = null,
    /** When true, a *negative* delta is the good outcome (e.g. failed payments). */
    lowerIsBetter = false,
    sparkline = [],
    loading = false,
}) => {
    const gradientId = useId();
    const formatted = format === 'currency' ? formatCurrencyCompact(value) : formatNumber(value);

    const hasDelta = deltaPct !== null && deltaPct !== undefined;
    const isFlat = hasDelta && Math.abs(deltaPct) < 0.05;
    const isGood = hasDelta && !isFlat && (lowerIsBetter ? deltaPct < 0 : deltaPct > 0);
    const deltaTone = !hasDelta || isFlat ? 'text-text-muted' : isGood ? 'text-positive' : 'text-negative';

    return (
        <Card
            padding="md"
            className="relative overflow-hidden transition-[transform,box-shadow] duration-[--duration-fast] ease-[--ease-out] hover:-translate-y-1 hover:shadow-raised"
        >
            <p className="text-xs text-text-muted">{label}</p>

            <div className="mt-1.5 min-h-8">
                {loading ? (
                    <Skeleton className="h-7 w-24" />
                ) : (
                    <p className="text-xl font-semibold tabular-nums text-text sm:text-2xl">{formatted}</p>
                )}
            </div>

            {!loading && hasDelta && (
                <div className={cn('relative z-10 mt-1 inline-flex items-center gap-1 text-xs font-medium', deltaTone)}>
                    {isFlat ? (
                        <Minus size={13} aria-hidden="true" />
                    ) : deltaPct > 0 ? (
                        <ArrowUpRight size={13} aria-hidden="true" />
                    ) : (
                        <ArrowDownRight size={13} aria-hidden="true" />
                    )}
                    <span>{Math.abs(deltaPct).toFixed(1)}%</span>
                    <span className="text-text-muted">vs previous</span>
                </div>
            )}

            {!loading && sparkline.length > 1 && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-9 opacity-70" aria-hidden="true">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            data={sparkline.map((v) => ({ v }))}
                            margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                        >
                            <defs>
                                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={VIZ_PRIMARY} stopOpacity={AREA_FILL_OPACITY.top} />
                                    <stop offset="100%" stopColor={VIZ_PRIMARY} stopOpacity={AREA_FILL_OPACITY.bottom} />
                                </linearGradient>
                            </defs>
                            <Area
                                type="monotone"
                                dataKey="v"
                                stroke={VIZ_PRIMARY}
                                strokeWidth={SPARKLINE_STROKE_WIDTH}
                                fill={`url(#${gradientId})`}
                                isAnimationActive={false}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}
        </Card>
    );
};

export default KpiTile;
