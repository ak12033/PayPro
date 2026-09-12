import React from 'react';
import { Sparkles } from 'lucide-react';
import NetworkMesh from '../ui/NetworkMesh';

/**
 * Full-viewport loading state, used by the route Suspense fallback and by the
 * auth guard while the silent refresh is still in flight.
 *
 * `min-h-dvh` rather than `min-h-screen`: on mobile Safari, `100vh` is the
 * viewport *without* the browser chrome, so a full-height loader was taller
 * than the visible area and the spinner sat slightly below centre.
 *
 * This is deliberately not a timed splash screen — see Landing's header
 * comment for why the product had one and removed it. The mark's formation
 * (blur/scale/light-sweep) plays once on mount and settles into a sustained
 * breathe/pulse/orbit loop, so the same markup reads correctly whether the
 * real work behind it takes 100ms or several seconds; dismissal is always
 * the caller unmounting this, never a timer owned by the component itself.
 */
const FullScreenLoader = ({ message, srLabel = 'Loading' }) => (
    <div
        className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-canvas"
        role="status"
        aria-live="polite"
    >
        <div className="absolute inset-0 -z-10 opacity-40">
            <NetworkMesh density="subtle" />
        </div>

        <div className="flex flex-col items-center gap-5">
            <div className="relative grid h-24 w-24 place-items-center">
                {/* Soft light forming behind the mark. */}
                <div className="absolute h-20 w-20 rounded-full bg-gradient-brand opacity-25 blur-2xl animate-loader-breathe" />

                {/* Two staggered rings radiating from the mark's own
                    footprint — reads as a system initializing rather than a
                    generic spinner, and `rounded-panel` keeps them the same
                    family of shape as the mark instead of a circular ping. */}
                <span className="absolute h-14 w-14 rounded-panel border border-accent-border animate-loader-pulse-ring" />
                <span
                    className="absolute h-14 w-14 rounded-panel border border-accent-border animate-loader-pulse-ring"
                    style={{ animationDelay: '1.2s' }}
                />

                {/* A single orbiting node — the wider neural network the
                    backdrop mesh sketches, condensed to one data point in
                    close orbit around the mark. */}
                <span className="absolute h-20 w-20 animate-loader-orbit" aria-hidden="true">
                    <span className="absolute -top-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-accent" />
                </span>

                {/* The mark itself — same brand badge as the landing header
                    and auth layout, scaled up for a hero moment rather than
                    replaced with anything invented. */}
                <span
                    aria-hidden="true"
                    className="relative grid h-14 w-14 place-items-center overflow-hidden rounded-panel bg-gradient-brand text-on-accent shadow-glow-accent animate-loader-reveal"
                >
                    <span className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/50 to-transparent animate-shimmer-sweep" />
                    <Sparkles size={24} />
                </span>
            </div>

            {message && (
                <p className="text-sm text-text-muted animate-fade-in" style={{ animationDelay: '280ms' }}>
                    {message}
                </p>
            )}
        </div>

        <span className="sr-only">{srLabel}</span>
    </div>
);

export default FullScreenLoader;
