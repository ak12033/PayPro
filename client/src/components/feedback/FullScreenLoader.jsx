import React from 'react';
import Spinner from '../ui/Spinner';

/**
 * Full-viewport loading state, used by the route Suspense fallback and by the
 * auth guard while the silent refresh is still in flight.
 *
 * `min-h-dvh` rather than `min-h-screen`: on mobile Safari, `100vh` is the
 * viewport *without* the browser chrome, so a full-height loader was taller
 * than the visible area and the spinner sat slightly below centre.
 */
const FullScreenLoader = ({ message, srLabel = 'Loading' }) => (
    <div
        className="flex min-h-dvh items-center justify-center bg-canvas"
        role="status"
        aria-live="polite"
    >
        <div className="flex flex-col items-center gap-3">
            <Spinner size="lg" />
            {message && <p className="text-sm text-text-muted">{message}</p>}
        </div>
        <span className="sr-only">{srLabel}</span>
    </div>
);

export default FullScreenLoader;
