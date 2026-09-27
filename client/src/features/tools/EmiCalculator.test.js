import { describe, it, expect } from 'vitest';
import { calculateEmi } from './EmiCalculator';

/**
 * The EMI formula is the only arithmetic in the client that a user might check
 * against a bank's own calculator — so it is worth pinning against known-good
 * values rather than against whatever this implementation happens to produce.
 */
describe('calculateEmi', () => {
    it('matches the standard figure for a ₹5,00,000 loan at 9.5% over 60 months', () => {
        const result = calculateEmi({ principal: 500000, annualRatePct: 9.5, months: 60 });

        /**
         * ₹10,500.93. Verified two independent ways rather than taken from the
         * implementation: the closed form above, and by solving for the payment
         * that amortises the balance to exactly zero over 60 months. Both agree
         * to the paise, which is what makes this a real check on the formula
         * rather than a snapshot of whatever it currently returns.
         */
        expect(result.emi).toBeCloseTo(10500.93, 2);
        expect(result.months).toBe(60);
    });

    it('reports total repaid and interest consistently with the monthly figure', () => {
        const result = calculateEmi({ principal: 500000, annualRatePct: 9.5, months: 60 });

        expect(result.total).toBeCloseTo(result.emi * 60, 6);
        expect(result.interest).toBeCloseTo(result.total - 500000, 6);
    });

    it('splits an interest-free loan evenly instead of dividing by zero', () => {
        // (1+r)^n - 1 is zero at r = 0, so the general formula is undefined here
        // — and 0% is a real input someone will type.
        const result = calculateEmi({ principal: 12000, annualRatePct: 0, months: 12 });

        expect(result.emi).toBe(1000);
        expect(result.interest).toBe(0);
        expect(result.total).toBe(12000);
    });

    it('handles a single-month term', () => {
        const result = calculateEmi({ principal: 10000, annualRatePct: 12, months: 1 });

        // One month at 1% monthly: the whole principal plus one month's interest.
        expect(result.emi).toBeCloseTo(10100, 2);
    });

    it('returns null rather than a number for inputs that make no sense', () => {
        expect(calculateEmi({ principal: 0, annualRatePct: 9, months: 12 })).toBeNull();
        expect(calculateEmi({ principal: -1000, annualRatePct: 9, months: 12 })).toBeNull();
        expect(calculateEmi({ principal: 1000, annualRatePct: 9, months: 0 })).toBeNull();
        expect(calculateEmi({ principal: 1000, annualRatePct: -5, months: 12 })).toBeNull();
        expect(calculateEmi({ principal: '', annualRatePct: '', months: '' })).toBeNull();
        expect(calculateEmi({ principal: 'abc', annualRatePct: 9, months: 12 })).toBeNull();
    });

    it('accepts numeric strings, since they come straight from inputs', () => {
        const result = calculateEmi({ principal: '500000', annualRatePct: '9.5', months: '60' });
        expect(result.emi).toBeCloseTo(10500.93, 2);
    });

    it('costs more in interest over a longer term at the same rate', () => {
        const shorter = calculateEmi({ principal: 500000, annualRatePct: 9.5, months: 36 });
        const longer = calculateEmi({ principal: 500000, annualRatePct: 9.5, months: 60 });

        expect(longer.emi).toBeLessThan(shorter.emi);
        expect(longer.interest).toBeGreaterThan(shorter.interest);
    });
});
