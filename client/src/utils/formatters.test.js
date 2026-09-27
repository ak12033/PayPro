import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    formatCurrency,
    formatSignedCurrency,
    maskEmail,
    formatRelativeTime,
    formatDayLabel,
    getRangeStartDate,
    groupByDay,
} from './formatters';
import { LEDGER_TYPES } from '../constants/transactions';

describe('formatCurrency', () => {
    it('always shows two decimal places', () => {
        expect(formatCurrency(48250.5)).toBe('₹48,250.50');
    });

    it('treats a missing value as zero rather than throwing', () => {
        expect(formatCurrency(undefined)).toBe('₹0.00');
    });
});

describe('formatSignedCurrency', () => {
    it('prefixes a debit with a minus sign', () => {
        expect(formatSignedCurrency(1200, LEDGER_TYPES.DEBIT)).toBe('-₹1,200.00');
    });

    it('prefixes anything else with a plus sign', () => {
        expect(formatSignedCurrency(1200, LEDGER_TYPES.CREDIT)).toBe('+₹1,200.00');
    });
});

describe('maskEmail', () => {
    it('keeps the first two characters and the domain', () => {
        expect(maskEmail('john@example.com')).toBe('jo••@example.com');
    });

    it('returns an empty string for a falsy input', () => {
        expect(maskEmail('')).toBe('');
        expect(maskEmail(null)).toBe('');
    });
});

describe('formatRelativeTime', () => {
    beforeEach(() => vi.useFakeTimers().setSystemTime(new Date('2026-03-10T12:00:00.000Z')));
    afterEach(() => vi.useRealTimers());

    it('reports very recent timestamps as "just now"', () => {
        expect(formatRelativeTime(new Date('2026-03-10T11:59:40.000Z'))).toBe('just now');
    });

    it('reports minutes ago within the hour', () => {
        expect(formatRelativeTime(new Date('2026-03-10T11:55:00.000Z'))).toBe('5 minutes ago');
    });

    it('falls back to an absolute date beyond a week', () => {
        expect(formatRelativeTime(new Date('2026-02-01T12:00:00.000Z'))).toMatch(/Feb/);
    });

    it('returns an empty string for an invalid date', () => {
        expect(formatRelativeTime('not-a-date')).toBe('');
    });
});

describe('formatDayLabel', () => {
    beforeEach(() => vi.useFakeTimers().setSystemTime(new Date('2026-03-10T12:00:00.000Z')));
    afterEach(() => vi.useRealTimers());

    it('labels today', () => {
        expect(formatDayLabel(new Date('2026-03-10T12:00:00.000Z'))).toBe('Today');
    });

    it('labels yesterday', () => {
        expect(formatDayLabel(new Date('2026-03-09T12:00:00.000Z'))).toBe('Yesterday');
    });
});

describe('getRangeStartDate', () => {
    it('returns null for "All"', () => {
        expect(getRangeStartDate('All')).toBeNull();
    });

    it('returns null for an unrecognised preset', () => {
        expect(getRangeStartDate('nonsense')).toBeNull();
    });

    it('computes a start-of-day boundary for "Today"', () => {
        vi.useFakeTimers().setSystemTime(new Date('2026-03-10T18:00:00.000Z'));
        const start = new Date(getRangeStartDate('Today'));
        expect(start.getHours()).toBe(0);
        expect(start.getMinutes()).toBe(0);
        vi.useRealTimers();
    });
});

describe('groupByDay', () => {
    it('buckets items by calendar day, preserving chronological order of the buckets', () => {
        const items = [
            { id: 1, createdAt: '2026-03-10T03:00:00.000Z' },
            { id: 2, createdAt: '2026-03-10T07:00:00.000Z' },
            { id: 3, createdAt: '2026-03-09T03:00:00.000Z' },
        ];

        const buckets = groupByDay(items);

        expect(buckets).toHaveLength(2);
        expect(buckets[0].items.map((i) => i.id)).toEqual([1, 2]);
        expect(buckets[1].items.map((i) => i.id)).toEqual([3]);
    });

    it('skips an item with an unparseable date rather than throwing', () => {
        const buckets = groupByDay([{ id: 1, createdAt: 'garbage' }]);
        expect(buckets).toHaveLength(0);
    });
});
