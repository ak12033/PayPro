import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useQuery } from './useQuery';
import { clearQueryCache } from '../lib/queryCache';
import { setAccessToken } from '../services/auth/tokenStore';

describe('useQuery', () => {
    it('does not call the fetcher when disabled', () => {
        const fetcher = vi.fn().mockResolvedValue('data');
        const { result } = renderHook(() => useQuery(fetcher, { enabled: false }));

        expect(fetcher).not.toHaveBeenCalled();
        expect(result.current.loading).toBe(false);
    });

    it('loads data from the fetcher', async () => {
        const fetcher = vi.fn().mockResolvedValue({ id: 1 });
        const { result } = renderHook(() => useQuery(fetcher));

        expect(result.current.loading).toBe(true);

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.data).toEqual({ id: 1 });
        expect(result.current.error).toBeNull();
    });

    it('maps a rejected fetch to a readable error rather than throwing', async () => {
        const fetcher = vi.fn().mockRejectedValue(new Error('boom'));
        const { result } = renderHook(() => useQuery(fetcher));

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.data).toBeNull();
        expect(result.current.error).toBeTruthy();
    });

    it('retry re-invokes the fetcher', async () => {
        const fetcher = vi.fn().mockResolvedValue('first');
        const { result } = renderHook(() => useQuery(fetcher));

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(fetcher).toHaveBeenCalledTimes(1);

        fetcher.mockResolvedValue('second');
        await act(async () => {
            await result.current.retry();
        });

        expect(fetcher).toHaveBeenCalledTimes(2);
        expect(result.current.data).toBe('second');
    });

    describe('with a cache key', () => {
        afterEach(() => clearQueryCache());

        it('paints the last value on remount and refreshes it in the background', async () => {
            const fetcher = vi.fn().mockResolvedValue('first');
            const first = renderHook(() => useQuery(fetcher, { key: 'test:remount' }));
            await waitFor(() => expect(first.result.current.data).toBe('first'));
            first.unmount();

            let resolve;
            fetcher.mockReturnValue(new Promise((r) => { resolve = r; }));
            const second = renderHook(() => useQuery(fetcher, { key: 'test:remount' }));

            // No loading state: the cached value is there on the first render.
            expect(second.result.current.loading).toBe(false);
            expect(second.result.current.data).toBe('first');
            expect(second.result.current.refreshing).toBe(true);

            await act(async () => resolve('second'));
            expect(second.result.current.data).toBe('second');
            expect(fetcher).toHaveBeenCalledTimes(2);
        });

        it('always revalidates a hit rather than trusting it', async () => {
            const fetcher = vi.fn().mockResolvedValue('value');
            const first = renderHook(() => useQuery(fetcher, { key: 'test:always' }));
            await waitFor(() => expect(first.result.current.loading).toBe(false));
            first.unmount();

            renderHook(() => useQuery(fetcher, { key: 'test:always' }));
            await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
        });

        it('keeps local edits made through setData', async () => {
            const fetcher = vi.fn().mockResolvedValue([1, 2]);
            const first = renderHook(() => useQuery(fetcher, { key: 'test:edit' }));
            await waitFor(() => expect(first.result.current.data).toEqual([1, 2]));
            act(() => first.result.current.setData((list) => list.filter((n) => n !== 2)));
            first.unmount();

            fetcher.mockReturnValue(new Promise(() => {}));
            const second = renderHook(() => useQuery(fetcher, { key: 'test:edit' }));
            expect(second.result.current.data).toEqual([1]);
        });

        it('forgets everything when the session ends', async () => {
            setAccessToken('token');
            const fetcher = vi.fn().mockResolvedValue('private');
            const first = renderHook(() => useQuery(fetcher, { key: 'test:session' }));
            await waitFor(() => expect(first.result.current.data).toBe('private'));
            first.unmount();

            setAccessToken(null);

            fetcher.mockReturnValue(new Promise(() => {}));
            const second = renderHook(() => useQuery(fetcher, { key: 'test:session' }));
            expect(second.result.current.loading).toBe(true);
            expect(second.result.current.data).toBeNull();
        });
    });
});
