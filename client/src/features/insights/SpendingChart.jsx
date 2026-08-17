import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { CURRENCY_LOCALE, CURRENCY_SYMBOL } from '../../constants/app';

/**
 * Volume breakdown.
 *
 * Deliberately still a donut, but with the honest legend the old one lacked.
 * The previous chart rendered three slices with the total repeated *four*
 * times — once in the header, once in the middle of the donut, once in the
 * tooltip and once per legend row — while the thing a reader actually needs
 * from a proportion chart is the proportion, which was only available on hover.
 *
 * Colour choices are deliberate and not decorative:
 *
 *   - The three series use the semantic money tokens (negative / positive /
 *     accent), so the chart agrees with every amount elsewhere in the product
 *     about what "money out" looks like.
 *   - Every slice is also labelled in the legend with its percentage, so the
 *     chart is readable without distinguishing the colours at all. A donut
 *     whose meaning lives only in hue excludes roughly 1 in 12 men.
 *   - Colours come from CSS variables, so the chart re-themes with the app
 *     instead of staying light-mode red on a dark canvas.
 */
const SpendingChart = ({ sent = 0, received = 0, added = 0 }) => {
    const series = [
        { name: 'Sent', value: Number(sent) || 0, token: 'var(--color-negative)' },
        { name: 'Received', value: Number(received) || 0, token: 'var(--color-positive)' },
        { name: 'Added', value: Number(added) || 0, token: 'var(--color-accent)' },
    ];

    const total = series.reduce((sum, item) => sum + item.value, 0);

    if (total === 0) {
        return (
            <p className="py-10 text-center text-sm text-text-muted">
                No money has moved yet. Your breakdown will appear once it does.
            </p>
        );
    }

    const format = (value) =>
        `${CURRENCY_SYMBOL}${Number(value || 0).toLocaleString(CURRENCY_LOCALE)}`;

    return (
        <div className="grid gap-6 sm:grid-cols-[200px_1fr] sm:items-center">
            <div className="relative h-48">
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                    <div>
                        <p className="text-xs text-text-muted">Total</p>
                        <p className="text-base font-semibold tabular-nums text-text">
                            {format(total)}
                        </p>
                    </div>
                </div>

                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={series}
                            dataKey="value"
                            innerRadius={56}
                            outerRadius={78}
                            paddingAngle={2}
                            stroke="var(--color-surface)"
                            strokeWidth={2}
                            // Animation off: the chart re-animates on every
                            // re-render otherwise, which on a page with a live
                            // balance means it spins whenever anything updates.
                            isAnimationActive={false}
                        >
                            {series.map((item) => (
                                <Cell key={item.name} fill={item.token} />
                            ))}
                        </Pie>
                        <Tooltip content={<ChartTooltip total={total} />} />
                    </PieChart>
                </ResponsiveContainer>
            </div>

            {/*
             * The legend is a definition list, not a decorated div — so the
             * data is available as structured content to a screen reader, which
             * cannot read the SVG at all.
             */}
            <dl className="space-y-2.5">
                {series.map((item) => {
                    const percent = total ? ((item.value / total) * 100).toFixed(0) : '0';

                    return (
                        <div key={item.name} className="flex items-center gap-3">
                            <span
                                aria-hidden="true"
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: item.token }}
                            />
                            <dt className="flex-1 text-sm text-text-secondary">{item.name}</dt>
                            <dd className="text-sm font-medium tabular-nums text-text">
                                {format(item.value)}
                                <span className="ml-2 text-text-muted">{percent}%</span>
                            </dd>
                        </div>
                    );
                })}
            </dl>
        </div>
    );
};

const ChartTooltip = ({ active, payload, total }) => {
    if (!active || !payload?.length) return null;

    const item = payload[0]?.payload;
    if (!item) return null;

    const percent = total ? ((item.value / total) * 100).toFixed(1) : '0.0';

    return (
        <div className="rounded-control border border-border bg-overlay px-3 py-2 shadow-overlay">
            <p className="text-sm font-medium text-text">{item.name}</p>
            <p className="mt-0.5 text-xs text-text-muted">
                {CURRENCY_SYMBOL}
                {Number(item.value).toLocaleString(CURRENCY_LOCALE)} · {percent}%
            </p>
        </div>
    );
};

export default SpendingChart;
