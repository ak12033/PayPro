import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PieChart, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import cn from '../../lib/cn';
import Card, { CardHeader } from '../../components/ui/Card';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import { formatCurrencyCompact } from '../../utils/formatters';
import { ROUTES } from '../../constants/routes';
import {
    DIMMED_OPACITY, HOVER_BRIGHTNESS, seriesColor, sliceGlow, swatchGlow, VIZ_OTHER,
} from '../../lib/chartTheme';

/**
 * Chart 4 + 5 — where spending went, ranked *and* proportioned.
 *
 * The previous version of this card was a ranked bar list only, on the
 * reasoning that a donut showing the same categories would repeat the same
 * numbers in a harder-to-compare shape. That's true of a donut with no
 * legend. This one keeps the ranked list — it's still how "what's biggest"
 * gets answered — and adds the donut for the thing a list of bars can't show
 * well: how the whole pie actually divides, at a glance, before reading a
 * single number.
 *
 * Geometry is hand-rolled SVG rather than a charting library on purpose:
 * Recharts is loaded only on the Insights page (see that page's comment) so
 * every dashboard visitor isn't paying for a charting bundle to render six
 * wedges. A donut is just arc math.
 *
 * Colours are the six `--color-viz-*` slots from chartTheme, in fixed slot
 * order — never assigned by rank, so a category keeps its colour across
 * timeframe changes even as amounts reorder it. "Other" always renders in the
 * neutral slot, never a hue slot: it isn't a category with its own identity
 * to defend.
 *
 * The ramp is drawn from the brand's cyan-teal-emerald family and separates
 * its slots on lightness rather than hue (see tokens.css), which is what lets
 * six same-family wedges stay tellable apart — including for a colourblind
 * reader, and including the last wedge meeting the first. Slot 1 is
 * `--color-accent` exactly, so the dominant category (callers sort by amount)
 * is the same colour as the Send button.
 *
 * The hover glow on an active wedge and the active legend row share one
 * recipe with `--shadow-glow-accent` (a tight 1px shadow plus a soft bloom),
 * and the active-slice brightness lift is the button's `hover:brightness-110`
 * exactly — so interacting with a slice reads as the same physical material
 * as the button. Both come from chartTheme so a wedge and its legend swatch
 * cannot drift apart.
 */

const SIZE = 220;
const CENTER = SIZE / 2;
const OUTER_R = 92;
const INNER_R = 60;
const GAP_DEG = 2.2;
const POP_PX = 6;

const toRad = (deg) => ((deg - 90) * Math.PI) / 180;
const pointOn = (radius, deg) => {
    const rad = toRad(deg);
    return { x: CENTER + radius * Math.cos(rad), y: CENTER + radius * Math.sin(rad) };
};

/** One donut wedge as an SVG path, clamped just under a full circle so a lone 100% slice still draws. */
const wedgePath = (startDeg, endDeg, innerR, outerR) => {
    const end = startDeg + Math.min(endDeg - startDeg, 359.99);
    const largeArc = end - startDeg > 180 ? 1 : 0;
    const outerEnd = pointOn(outerR, end);
    const outerStart = pointOn(outerR, startDeg);
    const innerStart = pointOn(innerR, startDeg);
    const innerEnd = pointOn(innerR, end);

    return [
        `M ${outerEnd.x} ${outerEnd.y}`,
        `A ${outerR} ${outerR} 0 ${largeArc} 0 ${outerStart.x} ${outerStart.y}`,
        `L ${innerStart.x} ${innerStart.y}`,
        `A ${innerR} ${innerR} 0 ${largeArc} 1 ${innerEnd.x} ${innerEnd.y}`,
        'Z',
    ].join(' ');
};

/** "Groceries represents 34.8% of total spending, followed by Transport at 22.1%..." for screen readers. */
const describeBreakdown = (items) =>
    items.reduce((sentence, item, index) => {
        if (index === 0) return `${item.category} represents ${item.percent}% of total spending`;
        return `${sentence}, followed by ${item.category} at ${item.percent}%`;
    }, '') + (items.length ? '.' : '');

const CategoryBreakdown = ({ categories, loading, error, onRetry }) => {
    const navigate = useNavigate();
    const chartRef = useRef(null);
    const [activeKey, setActiveKey] = useState(null);
    const [tooltip, setTooltip] = useState(null);

    const items = useMemo(() => categories?.items ?? [], [categories]);
    const totalAmount = categories?.totalAmount ?? 0;

    /** Angles come from the raw amount ratio, not the rounded display percent, so wedges never visibly gap or overlap. */
    const slices = useMemo(() => {
        let cursor = 0;
        return items.map((item, index) => {
            const span = totalAmount ? (item.amount / totalAmount) * 360 : 0;
            const startAngle = cursor;
            cursor += span;
            return {
                ...item,
                key: item.category,
                color: item.category === 'Other' ? VIZ_OTHER : seriesColor(index),
                startAngle,
                endAngle: cursor,
                // "Other" folds several real categories together — there is no
                // single category value the history endpoint could filter by.
                navigable: item.category !== 'Other',
            };
        });
    }, [items, totalAmount]);

    if (error) {
        return (
            <Card className="animate-rise">
                <ErrorState title="Spending breakdown unavailable" message={error} onRetry={onRetry} />
            </Card>
        );
    }

    const activeSlice = slices.find((slice) => slice.key === activeKey) ?? null;
    const centerAmount = activeSlice ? activeSlice.amount : totalAmount;
    const centerLabel = activeSlice ? activeSlice.category : 'Total spent';

    const goToCategory = (slice) => {
        if (!slice.navigable) return;
        navigate(`${ROUTES.ACTIVITY}?category=${encodeURIComponent(slice.category)}`);
    };

    const positionTooltip = (event, item) => {
        const rect = chartRef.current?.getBoundingClientRect();
        if (!rect) return;
        setTooltip({ item, x: event.clientX - rect.left, y: event.clientY - rect.top });
    };

    return (
        <Card className="animate-rise">
            <CardHeader title="Spending by category" description="Ranked by amount this period" />

            <div className="mt-4">
                {loading ? (
                    <div className="grid gap-6 sm:grid-cols-[13rem_1fr] sm:items-center">
                        <div className="relative mx-auto h-48 w-48 sm:mx-0 sm:h-52 sm:w-52">
                            <Skeleton className="h-full w-full" rounded="rounded-full" />
                            {/* Punches the donut hole out of the skeleton circle so the
                                loading shape already reads as a ring, not a solid disc. */}
                            <div
                                aria-hidden="true"
                                className="absolute inset-[27%] rounded-full bg-surface"
                            />
                        </div>
                        <div className="space-y-2.5">
                            {Array.from({ length: 5 }, (_, i) => (
                                <Skeleton key={i} className="h-9 w-full" />
                            ))}
                        </div>
                    </div>
                ) : items.length === 0 ? (
                    <EmptyState
                        variant="first-run"
                        icon={<PieChart size={20} />}
                        title="No spending yet"
                        description="Once you make a payment or send money, its category will show up here."
                    />
                ) : (
                    <div className="grid gap-6 sm:grid-cols-[13rem_1fr] sm:items-center">
                        {/* ------------------------------------------------------ donut */}
                        <div
                            ref={chartRef}
                            className="relative mx-auto h-48 w-48 shrink-0 animate-rise sm:mx-0 sm:h-52 sm:w-52"
                            onMouseLeave={() => {
                                setActiveKey(null);
                                setTooltip(null);
                            }}
                        >
                            {/* Depth without a full glass surface: a soft radial wash
                                behind the ring, not a backdrop-blur panel — Card's glass
                                variant is reserved for a screen's one or two hero
                                surfaces, and a dense dashboard grid isn't that. Brightens
                                gently on hover so the ambient glow tracks engagement
                                instead of sitting static. */}
                            <div
                                aria-hidden="true"
                                className="absolute inset-[10%] rounded-full transition-opacity duration-[--duration-slow] ease-[--ease-out]"
                                style={{
                                    background: 'radial-gradient(circle, var(--color-accent-soft) 0%, transparent 72%)',
                                    opacity: activeKey ? 0.95 : 0.7,
                                }}
                            />
                            {/* Tighter brand-tinted backlight behind the centre readout —
                                same accent as the Send button, kept subtle enough that the
                                total/amount stays in ordinary text ink, never accent-coloured
                                text. */}
                            <div
                                aria-hidden="true"
                                className="absolute inset-[36%] rounded-full transition-opacity duration-[--duration-slow] ease-[--ease-out]"
                                style={{
                                    background:
                                        'radial-gradient(circle, color-mix(in srgb, var(--color-accent) 22%, transparent) 0%, transparent 75%)',
                                    opacity: activeKey ? 0.85 : 0.5,
                                }}
                            />

                            <svg
                                viewBox={`0 0 ${SIZE} ${SIZE}`}
                                className="relative h-full w-full overflow-visible"
                                aria-hidden="true"
                                style={{ filter: 'drop-shadow(0 6px 16px rgb(0 0 0 / 0.10))' }}
                            >
                                {slices.map((slice) => {
                                    const isActive = activeKey === slice.key;
                                    const isDimmed = activeKey !== null && !isActive;
                                    const gap = slices.length > 1 ? GAP_DEG : 0;
                                    const start = slice.startAngle + gap / 2;
                                    const end = Math.max(start, slice.endAngle - gap / 2);
                                    const mid = toRad((start + end) / 2);
                                    const pushX = isActive ? Math.cos(mid) * POP_PX : 0;
                                    const pushY = isActive ? Math.sin(mid) * POP_PX : 0;

                                    return (
                                        <path
                                            key={slice.key}
                                            d={wedgePath(start, end, INNER_R, OUTER_R)}
                                            fill={slice.color}
                                            stroke="var(--color-surface)"
                                            strokeWidth={2}
                                            style={{
                                                transform: `translate(${pushX}px, ${pushY}px) scale(${isActive ? 1.03 : 1})`,
                                                transformOrigin: `${CENTER}px ${CENTER}px`,
                                                opacity: isDimmed ? DIMMED_OPACITY : 1,
                                                filter: isActive
                                                    ? `brightness(${HOVER_BRIGHTNESS}) ${sliceGlow(slice.color)}`
                                                    : 'none',
                                                transition:
                                                    'transform var(--duration-fast) var(--ease-out), opacity var(--duration-fast) var(--ease-out), filter var(--duration-fast) var(--ease-out)',
                                                cursor: slice.navigable ? 'pointer' : 'default',
                                            }}
                                            onMouseEnter={(event) => {
                                                setActiveKey(slice.key);
                                                positionTooltip(event, slice);
                                            }}
                                            onMouseMove={(event) => positionTooltip(event, slice)}
                                            onClick={() => goToCategory(slice)}
                                        />
                                    );
                                })}
                            </svg>

                            {tooltip && (
                                <div
                                    key={tooltip.item.key}
                                    className="pointer-events-none absolute z-10 min-w-[9.5rem] animate-rise whitespace-nowrap rounded-control border border-border-glass bg-surface-glass px-3 py-2.5 shadow-overlay backdrop-blur-xl"
                                    style={{ left: tooltip.x, top: tooltip.y, transform: 'translate(-50%, calc(-100% - 10px))' }}
                                >
                                    <div className="flex items-center gap-1.5">
                                        <span
                                            aria-hidden="true"
                                            className="h-2 w-2 shrink-0 rounded-full"
                                            style={{ backgroundColor: tooltip.item.color }}
                                        />
                                        <p className="text-sm font-medium text-text">{tooltip.item.category}</p>
                                    </div>
                                    <p className="mt-1 text-sm font-semibold tabular-nums text-text">
                                        {formatCurrencyCompact(tooltip.item.amount)}
                                    </p>
                                    <p className="text-xs text-text-muted">{tooltip.item.percent}% of total</p>
                                    {tooltip.item.trendPct !== null && tooltip.item.trendPct !== undefined && (
                                        <div className="mt-1.5 border-t border-border-glass pt-1.5">
                                            <TrendBadge trendPct={tooltip.item.trendPct} suffix=" vs previous period" />
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Centre readout — the total by default, the hovered/focused
                                category's own amount while a slice or legend row is active. */}
                            <div className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center">
                                <div key={activeKey ?? 'total'} className="animate-rise">
                                    <p className="text-xl font-bold tabular-nums text-text sm:text-2xl">
                                        {formatCurrencyCompact(centerAmount)}
                                    </p>
                                    <p className="mx-auto mt-1 max-w-[7rem] truncate text-xs text-text-muted">
                                        {centerLabel}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* ----------------------------------------------------- legend */}
                        <ul className="stagger space-y-1">
                            {slices.map((slice, index) => {
                                const isActive = activeKey === slice.key;
                                return (
                                    <li key={slice.key} style={{ '--stagger-index': index }}>
                                        <button
                                            type="button"
                                            onMouseEnter={() => setActiveKey(slice.key)}
                                            onFocus={() => setActiveKey(slice.key)}
                                            onMouseLeave={() => setActiveKey(null)}
                                            onBlur={() => setActiveKey(null)}
                                            onClick={() => goToCategory(slice)}
                                            className={cn(
                                                'flex w-full items-center gap-3 rounded-control border border-transparent px-2 py-2 text-left',
                                                'transition-colors duration-[--duration-fast] ease-[--ease-out]',
                                                slice.navigable ? 'cursor-pointer hover:bg-surface-hover' : 'cursor-default',
                                                isActive && 'border-border bg-surface-sunken'
                                            )}
                                        >
                                            <span
                                                aria-hidden="true"
                                                className="h-2.5 w-2.5 shrink-0 rounded-full transition-shadow duration-[--duration-fast] ease-[--ease-out]"
                                                style={{
                                                    backgroundColor: slice.color,
                                                    boxShadow: isActive ? swatchGlow(slice.color) : 'none',
                                                }}
                                            />
                                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">
                                                {slice.category}
                                            </span>
                                            <span className="flex shrink-0 items-baseline gap-2 text-xs">
                                                <span className="font-semibold tabular-nums text-text">
                                                    {formatCurrencyCompact(slice.amount)}
                                                </span>
                                                <span className="w-9 text-right text-text-muted">{slice.percent}%</span>
                                                {slice.trendPct !== null && slice.trendPct !== undefined && (
                                                    <TrendBadge trendPct={slice.trendPct} />
                                                )}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}

                {/* Structured for a screen reader, which can't read the SVG at all. */}
                {items.length > 0 && <p className="sr-only">{describeBreakdown(items)}</p>}
            </div>
        </Card>
    );
};

const TrendBadge = ({ trendPct, suffix = '' }) => {
    const isFlat = Math.abs(trendPct) < 0.5;
    const tone = isFlat ? 'text-text-muted' : trendPct > 0 ? 'text-negative' : 'text-positive';

    return (
        <span className={cn('inline-flex items-center gap-0.5 text-xs', tone)}>
            {isFlat ? (
                <Minus size={11} aria-hidden="true" />
            ) : trendPct > 0 ? (
                <ArrowUpRight size={11} aria-hidden="true" />
            ) : (
                <ArrowDownRight size={11} aria-hidden="true" />
            )}
            {Math.abs(trendPct).toFixed(0)}%{suffix}
        </span>
    );
};

export default CategoryBreakdown;
