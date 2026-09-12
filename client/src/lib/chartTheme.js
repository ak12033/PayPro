/**
 * One source of truth for how every chart in the product looks.
 *
 * Before this, each chart restated its own axis tick style, its own grid
 * stroke, its own area-fill opacity and its own series colour. Nine charts had
 * drifted into four different fill opacities (0.28, 0.3, 0.32, 0.35) and two
 * different active-dot recipes, and the network chart had ended up drawn in
 * `--color-ai` — the violet this design system reserves for AI-generated
 * content, which meant a chart about people you've paid was labelled, in the
 * product's own colour language, as machine output.
 *
 * Everything here resolves to a CSS variable rather than a literal, so charts
 * re-theme with the app instead of staying light-mode coloured on a dark
 * canvas. The only literals are numbers — opacities, stroke widths, radii —
 * which SVG needs as numbers and CSS variables cannot supply through
 * Recharts' prop API.
 */

/**
 * Categorical series, in fixed slot order.
 *
 * Slots are assigned by *identity*, never by rank, so a category keeps its
 * colour when amounts reorder it between timeframes. See tokens.css for how
 * the ramp is built and validated — the short version is that it separates on
 * lightness, not hue, so it survives colour blindness.
 */
export const VIZ_SERIES = [
    'var(--color-viz-1)',
    'var(--color-viz-2)',
    'var(--color-viz-3)',
    'var(--color-viz-4)',
    'var(--color-viz-5)',
    'var(--color-viz-6)',
];

/** The miscellany bucket. Never a hue slot. */
export const VIZ_OTHER = 'var(--color-viz-other)';

/**
 * The main series of any single-series chart.
 *
 * Always `--gradient-brand`'s opening stop, so a lone sparkline and the Send
 * button start from the same colour in either theme. (In light mode that is
 * also `--color-accent`; in dark mode the accent is a step darker — see
 * tokens.css for why the gradient stop, not the accent, is the tie that
 * holds.)
 */
export const VIZ_PRIMARY = VIZ_SERIES[0];

/** Slot for the Nth category, wrapping if there are more categories than slots. */
export const seriesColor = (index) => VIZ_SERIES[index % VIZ_SERIES.length];

/* ------------------------------------------------------------------ chrome */

/** Gridlines. Horizontal only at call sites — vertical rules fight the bars. */
export const gridProps = {
    vertical: false,
    stroke: 'var(--color-viz-grid)',
};

/** Axis tick labels. One type size for every axis in the product. */
export const axisTick = { fill: 'var(--color-viz-label)', fontSize: 11 };

/** The category axis keeps its baseline; the value axis does not need one. */
export const xAxisProps = {
    tick: axisTick,
    axisLine: { stroke: 'var(--color-viz-axis)' },
    tickLine: false,
    minTickGap: 28,
};

export const yAxisProps = {
    tick: axisTick,
    axisLine: false,
    tickLine: false,
};

/** Hover cursor: a hairline for line/area charts, a wash for bar charts. */
export const lineCursor = { stroke: 'var(--color-viz-cursor)', strokeWidth: 1 };
export const barCursor = { fill: 'var(--color-surface-hover)' };

/**
 * The dot that appears on the hovered point. Ringed in the surface colour so
 * it reads as sitting on top of the line rather than punched through it.
 */
export const activeDot = { r: 4, strokeWidth: 2, stroke: 'var(--color-surface)' };

export const SERIES_STROKE_WIDTH = 2;
export const SPARKLINE_STROKE_WIDTH = 1.5;

/**
 * Area fills.
 *
 * A single opacity pair for every area chart. Kept well under half: the fill
 * exists to say which side of the line is "under" it, and a saturated wash
 * competes with the stroke that carries the actual values.
 */
export const AREA_FILL_OPACITY = { top: 0.3, bottom: 0 };

/** Bar corner radius — top corners only, so bars sit on the axis. */
export const BAR_RADIUS = [4, 4, 0, 0];
export const BAR_MAX_WIDTH = 22;

/**
 * Hover emphasis for a slice or bar.
 *
 * A brightness lift rather than a second colour per slot: it works on any
 * slice without the palette needing a parallel "hover" ramp, and it is the
 * exact value the primary Button uses for `hover:brightness-110`, so a wedge
 * and a button feel like the same material. Direction is theme-correct by
 * construction — on light mode's dark slices it lightens toward the surface,
 * on dark mode's light slices it brightens further from it.
 */
export const HOVER_BRIGHTNESS = 1.1;
export const DIMMED_OPACITY = 0.6;

/**
 * The two-layer glow used on an active slice and its legend swatch: a tight
 * 1px shadow plus a soft bloom, tinted to whatever colour it is given. Same
 * recipe as `--shadow-glow-accent`.
 */
export const sliceGlow = (color) =>
    `drop-shadow(0 1px 2px color-mix(in srgb, ${color} 45%, transparent)) ` +
    `drop-shadow(0 8px 18px color-mix(in srgb, ${color} 40%, transparent))`;

export const swatchGlow = (color) =>
    `0 0 0 4px color-mix(in srgb, ${color} 22%, transparent), ` +
    `0 4px 12px color-mix(in srgb, ${color} 35%, transparent)`;
