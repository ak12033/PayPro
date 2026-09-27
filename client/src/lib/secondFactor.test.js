import { describe, it, expect } from 'vitest';
import { isCompleteFactor } from './secondFactor';

describe('isCompleteFactor', () => {
    it('accepts six digits and recovery codes however they are typed', () => {
        for (const ok of ['123456', 'ABCDE-23456', 'abcde23456', 'ABCDE 23456']) {
            expect(isCompleteFactor(ok), ok).toBe(true);
        }
    });

    it('waits for a complete code', () => {
        for (const partial of ['', '12345', '1234567', 'ABCDE-2345', null, undefined]) {
            expect(isCompleteFactor(partial), String(partial)).toBe(false);
        }
    });
});
