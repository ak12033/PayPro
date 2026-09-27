import { describe, it, expect } from 'vitest';
import { heatLevel, formatHour, busiestHour, HEAT_LEVELS, WEEKDAY_NAMES } from './rhythmScale';

describe('heatLevel', () => {
    it('is 0 for no spending, and for an all-empty grid', () => {
        expect(heatLevel(0, 500)).toBe(0);
        expect(heatLevel(0, 0)).toBe(0);
        expect(heatLevel(undefined, 500)).toBe(0);
    });

    it('never renders real spending as empty, however small', () => {
        expect(heatLevel(1, 100000)).toBe(1);
    });

    it('reaches the top level only at the peak', () => {
        expect(heatLevel(500, 500)).toBe(HEAT_LEVELS);
        expect(heatLevel(250, 500)).toBe(2);
        expect(heatLevel(260, 500)).toBe(3);
        expect(heatLevel(9999, 500)).toBe(HEAT_LEVELS);
    });
});

describe('formatHour', () => {
    it('uses a 12-hour clock with midnight and noon as 12', () => {
        expect(formatHour(0)).toBe('12 AM');
        expect(formatHour(9)).toBe('9 AM');
        expect(formatHour(12)).toBe('12 PM');
        expect(formatHour(23)).toBe('11 PM');
        expect(formatHour(18, { short: true })).toBe('6p');
    });
});

describe('busiestHour', () => {
    it('returns the first largest hour, or null for a day with no spending', () => {
        const hours = Array(24).fill(0);
        expect(busiestHour(hours)).toBeNull();
        hours[9] = 100;
        hours[20] = 100;
        hours[14] = 40;
        expect(busiestHour(hours)).toBe(9);
    });

    it('matches the server’s Monday-first week', () => {
        expect(WEEKDAY_NAMES[0]).toBe('Monday');
        expect(WEEKDAY_NAMES).toHaveLength(7);
    });
});
