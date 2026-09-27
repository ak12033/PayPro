/**
 * Pure helpers for `SpendingRhythm.jsx`, kept apart so the bucketing and the
 * wording can be tested without rendering a grid.
 */

/** Monday first, matching the server's `$isoDayOfWeek` ordering. */
export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Strength steps above "empty". Four is enough to read and few enough to tell apart. */
export const HEAT_LEVELS = 4;

/**
 * 0 for no spending; otherwise 1..HEAT_LEVELS relative to `max`.
 *
 * Any spending at all is at least level 1 — a ₹20 cell next to a ₹20,000 one
 * must still read as "something happened here", not as empty.
 */
export const heatLevel = (amount, max) => {
    if (!(amount > 0) || !(max > 0)) return 0;
    return Math.min(HEAT_LEVELS, Math.max(1, Math.ceil((amount / max) * HEAT_LEVELS)));
};

/** 0 → "12 AM", 13 → "1 PM"; `short` gives "12a"/"1p" for axis ticks. */
export const formatHour = (hour, { short = false } = {}) => {
    const twelve = hour % 12 === 0 ? 12 : hour % 12;
    const suffix = hour < 12 ? 'AM' : 'PM';
    return short ? `${twelve}${suffix[0].toLowerCase()}` : `${twelve} ${suffix}`;
};

/** Index of the largest positive value, or null when there is none. */
export const busiestHour = (hours) => {
    let best = null;
    hours.forEach((amount, hour) => {
        if (amount > 0 && (best === null || amount > hours[best])) best = hour;
    });
    return best;
};
