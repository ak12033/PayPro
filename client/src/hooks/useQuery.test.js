import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useQuery } from './useQuery';

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
});
