import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import FullScreenLoader, { FullScreenLoaderHost } from './FullScreenLoader';

vi.mock('../ui/NetworkMesh', () => ({ default: () => null }));

const Stage = ({ step }) => (
    <FullScreenLoaderHost>
        {step === 'session' && <FullScreenLoader key="session" message="Restoring your session…" />}
        {step === 'route' && <FullScreenLoader key="route" srLabel="Loading page" />}
        {step === 'done' && <p>Home</p>}
    </FullScreenLoaderHost>
);

afterEach(() => vi.useRealTimers());

describe('FullScreenLoaderHost', () => {
    it('keeps one loader on screen across a hand-off between callers', () => {
        vi.useFakeTimers();
        const { rerender } = render(<Stage step="session" />);
        const loader = screen.getByRole('status');
        expect(loader).toHaveTextContent('Restoring your session…');

        rerender(<Stage step="route" />);
        // Same DOM node, so the animation never restarts, and the message
        // survives a caller that has none of its own.
        expect(screen.getByRole('status')).toBe(loader);
        expect(loader).toHaveTextContent('Restoring your session…');
        expect(loader).toHaveTextContent('Loading page');

        rerender(<Stage step="done" />);
        expect(screen.getByText('Home')).toBeInTheDocument();
        act(() => vi.runAllTimers());
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('renders inline when there is no host', () => {
        render(<FullScreenLoader message="Checking" />);
        expect(screen.getByRole('status')).toHaveTextContent('Checking');
    });
});
