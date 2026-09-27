import config from '../config/env.js';

/**
 * One definition of "a day" and "a month", used everywhere a boundary matters.
 *
 * Before this file the app had three: `$dateTrunc` in UTC (analytics),
 * `new Date().setHours(0,0,0,0)` in server-local time (transfer 2FA velocity),
 * and `Asia/Kolkata` (the cron job). For an India-first product, "today" or
 * "this month" must mean IST regardless of which server timezone the process
 * happens to run under — a server in UTC and one in IST disagreed about
 * whether a 12:30am IST transaction belonged to "today" or "yesterday".
 *
 * IST has no daylight saving and is a fixed UTC+5:30 offset, so day/month
 * boundaries can be computed with plain arithmetic — no timezone database or
 * extra dependency required. `APP_TIMEZONE` exists as a documented seam for a
 * future multi-region deployment; only the fixed-offset case is implemented,
 * matching the only value this product has ever run with.
 */
export const APP_TIMEZONE = config.APP_TIMEZONE || 'Asia/Kolkata';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const toIstShifted = (date) => new Date(date.getTime() + IST_OFFSET_MS);
const fromIstShifted = (shifted) => new Date(shifted.getTime() - IST_OFFSET_MS);

/** Start of the IST calendar day containing `date` (default: now), as a real UTC instant. */
export const startOfDayIST = (date = new Date()) => {
    const shifted = toIstShifted(date);
    shifted.setUTCHours(0, 0, 0, 0);
    return fromIstShifted(shifted);
};

/** Start of the next IST calendar day. */
export const endOfDayIST = (date = new Date()) => {
    const start = startOfDayIST(date);
    return new Date(start.getTime() + 24 * 60 * 60 * 1000);
};

/** Start of the IST calendar month containing `date`. */
export const startOfMonthIST = (date = new Date()) => {
    const shifted = toIstShifted(date);
    shifted.setUTCHours(0, 0, 0, 0);
    shifted.setUTCDate(1);
    return fromIstShifted(shifted);
};

/** Start of the following IST calendar month. */
export const endOfMonthIST = (date = new Date()) => {
    const shifted = toIstShifted(date);
    shifted.setUTCHours(0, 0, 0, 0);
    shifted.setUTCDate(1);
    shifted.setUTCMonth(shifted.getUTCMonth() + 1);
    return fromIstShifted(shifted);
};

/** `{ start, end }` for the IST month `key` = 'YYYY-MM' (defaults to the current month). */
export const monthBoundsIST = (key = null) => {
    if (!key) {
        const now = new Date();
        return { start: startOfMonthIST(now), end: endOfMonthIST(now) };
    }
    const [year, month] = key.split('-').map(Number);
    const anchor = fromIstShifted(new Date(Date.UTC(year, month - 1, 15)));
    return { start: startOfMonthIST(anchor), end: endOfMonthIST(anchor) };
};

/** 'YYYY-MM' for the IST month containing `date`. */
export const monthKeyIST = (date = new Date()) => {
    const shifted = toIstShifted(date);
    const year = shifted.getUTCFullYear();
    const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
};

export default {
    APP_TIMEZONE,
    startOfDayIST,
    endOfDayIST,
    startOfMonthIST,
    endOfMonthIST,
    monthBoundsIST,
    monthKeyIST,
};
