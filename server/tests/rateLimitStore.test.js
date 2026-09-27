import { describe, it, expect } from 'vitest';
import { MongoStore } from '../middlewares/mongoRateLimitStore.js';

/**
 * Unit tests against the store directly, not through a mounted limiter — the
 * limiters themselves disable counting under the test runner (see
 * rateLimiters.js's `skip`), which is exactly the behaviour that would make
 * an end-to-end 429 test impossible to write without special-casing the
 * limiter under test out of that guard.
 */
describe('MongoStore', () => {
    const freshStore = (windowMs = 60_000) => {
        const store = new MongoStore({ prefix: `test-${Date.now()}-${Math.random()}` });
        store.init({ windowMs });
        return store;
    };

    it('starts a key at 1 on the first hit', async () => {
        const store = freshStore();
        const { totalHits } = await store.increment('user-1');
        expect(totalHits).toBe(1);
    });

    it('accumulates hits within the same window', async () => {
        const store = freshStore();
        await store.increment('user-1');
        await store.increment('user-1');
        const { totalHits } = await store.increment('user-1');
        expect(totalHits).toBe(3);
    });

    it('keeps two different keys independent', async () => {
        const store = freshStore();
        await store.increment('user-1');
        await store.increment('user-1');
        const { totalHits } = await store.increment('user-2');
        expect(totalHits).toBe(1);
    });

    it('starts a fresh window (count 1) once the previous one has expired', async () => {
        const store = freshStore(10); // 10ms window
        await store.increment('user-1');
        await new Promise((r) => setTimeout(r, 30));
        const { totalHits } = await store.increment('user-1');
        expect(totalHits).toBe(1);
    });

    it('decrement reduces the count without going below what a later increment can recover from', async () => {
        const store = freshStore();
        await store.increment('user-1');
        await store.increment('user-1');
        await store.decrement('user-1');
        const { totalHits } = await store.increment('user-1');
        expect(totalHits).toBe(2);
    });

    it('resetKey clears the counter entirely', async () => {
        const store = freshStore();
        await store.increment('user-1');
        await store.resetKey('user-1');
        const { totalHits } = await store.increment('user-1');
        expect(totalHits).toBe(1);
    });

    it('two limiters (two store instances) never share counters even for the same raw key', async () => {
        const login = new MongoStore({ prefix: 'login' });
        login.init({ windowMs: 60_000 });
        const transfer = new MongoStore({ prefix: 'transfer' });
        transfer.init({ windowMs: 60_000 });

        await login.increment('shared-user-id');
        await login.increment('shared-user-id');
        const { totalHits } = await transfer.increment('shared-user-id');

        expect(totalHits).toBe(1);
    });
});
