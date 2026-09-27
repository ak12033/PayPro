import { describe, it, expect } from 'vitest';
import { createIdempotencyKey } from './idempotency';

describe('createIdempotencyKey', () => {
    it('produces a non-empty string', () => {
        const key = createIdempotencyKey();
        expect(typeof key).toBe('string');
        expect(key.length).toBeGreaterThan(0);
    });

    it('produces a different key on every call', () => {
        const a = createIdempotencyKey();
        const b = createIdempotencyKey();
        expect(a).not.toBe(b);
    });
});
