import { describe, it, expect } from 'vitest';
import { toMinor, fromMinor, amountMinorOf, balanceMinorOf, newBalanceMinorOf } from './money';

describe('toMinor / fromMinor', () => {
    it('rounds the float product to the nearest paisa', () => {
        // 19.99 * 100 is 1998.9999999999998 in IEEE-754.
        expect(toMinor(19.99)).toBe(1999);
        expect(toMinor('0.1')).toBe(10);
    });

    it('treats garbage as zero rather than NaN', () => {
        expect(toMinor(undefined)).toBe(0);
        expect(toMinor('abc')).toBe(0);
        expect(fromMinor(null)).toBe(0);
    });

    it('converts paise back to rupees', () => {
        expect(fromMinor(1999)).toBe(19.99);
    });
});

describe('amountMinorOf', () => {
    it('prefers the integer column', () => {
        expect(amountMinorOf({ amount: 999, amountMinor: 1234 })).toBe(1234);
    });

    it('falls back to the rupee field for a row without one', () => {
        expect(amountMinorOf({ amount: 12.34 })).toBe(1234);
    });
});

describe('balanceMinorOf', () => {
    it('prefers balanceMinor, including a negative (overdrawn) one', () => {
        expect(balanceMinorOf({ accountBalance: 5, balanceMinor: -400 })).toBe(-400);
    });

    it('falls back to accountBalance', () => {
        expect(balanceMinorOf({ accountBalance: 0.3 })).toBe(30);
    });
});

describe('newBalanceMinorOf', () => {
    it('reads newBalanceMinor, then newBalance, else reports nothing', () => {
        expect(newBalanceMinorOf({ newBalance: 1, newBalanceMinor: 250 })).toBe(250);
        expect(newBalanceMinorOf({ newBalance: 2.5 })).toBe(250);
        expect(newBalanceMinorOf({ transaction: {} })).toBeNull();
    });

    it('treats a zero balance as a real value', () => {
        expect(newBalanceMinorOf({ newBalance: 0 })).toBe(0);
        expect(newBalanceMinorOf({ newBalanceMinor: 0 })).toBe(0);
    });
});
