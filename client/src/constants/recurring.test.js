import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    formatNextExpected,
    BILL_DISCLAIMER,
    RECURRING_DISCLAIMER,
    CADENCE_LABEL,
    BILL_STATUS_LABEL,
} from './recurring';

describe('formatNextExpected', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        // Mid-afternoon, so "today" is unambiguous and a naive
        // milliseconds-difference implementation would visibly disagree.
        vi.setSystemTime(new Date('2026-09-13T15:00:00'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('names the days around today rather than printing a date', () => {
        expect(formatNextExpected(new Date('2026-09-13T09:00:00'))).toBe('today');
        expect(formatNextExpected(new Date('2026-09-14T09:00:00'))).toBe('tomorrow');
        expect(formatNextExpected(new Date('2026-09-12T23:00:00'))).toBe('yesterday');
    });

    it('compares whole days, not instants', () => {
        // 08:00 tomorrow is 17 hours away — under a day in milliseconds, but
        // still "tomorrow" to a person reading it.
        expect(formatNextExpected(new Date('2026-09-14T08:00:00'))).toBe('tomorrow');
    });

    it('counts days within a month in either direction', () => {
        expect(formatNextExpected(new Date('2026-09-18T10:00:00'))).toBe('in 5 days');
        expect(formatNextExpected(new Date('2026-09-06T10:00:00'))).toBe('7 days ago');
    });

    it('falls back to a date beyond a month out', () => {
        // "in 87 days" is a number nobody converts into a plan.
        expect(formatNextExpected(new Date('2026-12-09T10:00:00'))).toMatch(/Dec/);
    });

    it('never throws on missing or unparseable input', () => {
        expect(formatNextExpected(null)).toBe('unknown');
        expect(formatNextExpected(undefined)).toBe('unknown');
        expect(formatNextExpected('not a date')).toBe('unknown');
    });
});

/**
 * These strings are the product's promise about what it does and does not do
 * (plan.md §18.3, §19.2). A well-meaning edit that turns "reminder" into
 * "payment" is the failure this guards against — it would read fine in review.
 */
describe('the copy contract', () => {
    it('the bill disclaimer says PayPro does not pay bills', () => {
        expect(BILL_DISCLAIMER).toMatch(/reminder only/i);
        expect(BILL_DISCLAIMER).toMatch(/does not pay bills/i);
    });

    it('the recurring disclaimer says PayPro cannot cancel anything', () => {
        expect(RECURRING_DISCLAIMER).toMatch(/look like/i);
        expect(RECURRING_DISCLAIMER).toMatch(/can't cancel/i);
    });

    it('never labels a detection as a subscription', () => {
        const allCopy = [
            BILL_DISCLAIMER,
            RECURRING_DISCLAIMER,
            ...Object.values(CADENCE_LABEL),
            ...Object.values(BILL_STATUS_LABEL),
        ].join(' ');

        expect(allCopy).not.toMatch(/subscri/i);
    });
});
