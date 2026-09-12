/**
 * Shared formatting for the dashboard's time-bucketed charts.
 *
 * The bucket unit (hour/day/week/month) is implied by the selected range, and
 * must read the same way on every chart that shares a timeframe — a user
 * switching from 1M to 1Y should see every card's x-axis relabel together,
 * not just the one they happened to be looking at.
 */

export const RANGE_OPTIONS = [
    { value: '1D', label: '1D' },
    { value: '7D', label: '7D' },
    { value: '1M', label: '1M' },
    { value: '3M', label: '3M' },
    { value: '6M', label: '6M' },
    { value: '1Y', label: '1Y' },
];

const UNIT_BY_RANGE = {
    '1D': 'hour',
    '7D': 'day',
    '1M': 'day',
    '3M': 'week',
    '6M': 'week',
    '1Y': 'month',
};

const HOUR_FMT = new Intl.DateTimeFormat('en-US', { hour: 'numeric' });
const DAY_FMT = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' });
const MONTH_FMT = new Intl.DateTimeFormat('en-GB', { month: 'short', year: '2-digit' });

export const formatAxisDate = (isoDate, range) => {
    const date = new Date(isoDate);
    const unit = UNIT_BY_RANGE[range] || 'day';
    if (unit === 'hour') return HOUR_FMT.format(date);
    if (unit === 'month') return MONTH_FMT.format(date);
    return DAY_FMT.format(date);
};

export const formatTooltipDate = (isoDate, range) => {
    const date = new Date(isoDate);
    const unit = UNIT_BY_RANGE[range] || 'day';
    if (unit === 'hour') {
        return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: 'numeric' });
    }
    if (unit === 'month') {
        return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    }
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'long' });
};

export const RANGE_LABELS = RANGE_OPTIONS.reduce((acc, opt) => {
    acc[opt.value] = opt.label;
    return acc;
}, {});
