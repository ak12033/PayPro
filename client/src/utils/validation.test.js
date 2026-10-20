import { describe, it, expect } from 'vitest';
import { isNonEmpty, isPositiveAmount, toAmount, isCompleteOtp, digitsOnly, isValidEmail, parseAmountParam } from './validation';

describe('isNonEmpty', () => {
    it('rejects whitespace-only input', () => {
        expect(isNonEmpty('   ')).toBe(false);
    });

    it('accepts a value with real content', () => {
        expect(isNonEmpty(' hi ')).toBe(true);
    });
});

describe('isPositiveAmount', () => {
    it.each([
        ['a negative number', -5, false],
        ['zero', 0, false],
        ['Infinity', Infinity, false],
        ['NaN', NaN, false],
        ['a positive number', 5, true],
        ['a numeric string', '5.50', true],
    ])('for %s returns %s', (_label, value, expected) => {
        expect(isPositiveAmount(value)).toBe(expected);
    });
});

describe('toAmount', () => {
    it('parses a numeric string', () => {
        expect(toAmount('42.5')).toBe(42.5);
    });

    it('falls back to zero for non-numeric input', () => {
        expect(toAmount('abc')).toBe(0);
        expect(toAmount(undefined)).toBe(0);
    });
});

describe('isCompleteOtp', () => {
    it('checks the default 6-digit length', () => {
        expect(isCompleteOtp('123456')).toBe(true);
        expect(isCompleteOtp('12345')).toBe(false);
    });

    it('honours a custom length', () => {
        expect(isCompleteOtp('1234', 4)).toBe(true);
    });
});

describe('digitsOnly', () => {
    it('strips everything but digits', () => {
        expect(digitsOnly('1a2b3c')).toBe('123');
    });

    it('handles a nullish value', () => {
        expect(digitsOnly(undefined)).toBe('');
    });
});

describe('isValidEmail', () => {
    it.each([
        ['a plain address', 'jane@example.com', true],
        ['a plus alias', 'jane+tag@example.com', true],
        ['missing an @', 'janeexample.com', false],
        ['missing a domain dot', 'jane@example', false],
        ['containing whitespace', 'jane @example.com', false],
    ])('for %s returns %s', (_label, value, expected) => {
        expect(isValidEmail(value)).toBe(expected);
    });
});

describe('parseAmountParam — the AddMoney ?amount= prefill (plan.md §40.4)', () => {
    it.each([
        ['500', '500'],
        ['500.5', '500.5'],
        ['500.50', '500.5'],
        [' 1000 ', '1000'],
        ['0.01', '0.01'],
    ])('accepts %j as %j', (input, expected) => {
        expect(parseAmountParam(input)).toBe(expected);
    });

    it.each([null, undefined, '', '0', '0.00', '-5', '1e3', '0x10', '500abc', '5.123', '12345678', 'Infinity', '500,00'])(
        'ignores %j',
        (input) => {
            expect(parseAmountParam(input)).toBe('');
        }
    );
});
