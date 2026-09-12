import React, { useEffect, useRef } from 'react';
import cn from '../../lib/cn';

/**
 * A cursor-following ambient glow, for the handful of screens that are
 * allowed to spend visual budget on decoration (see NetworkMesh).
 *
 * Same discipline as NetworkMesh: the animation loop never starts under
 * `prefers-reduced-motion`, and position updates are coalesced through
 * `requestAnimationFrame` and written as CSS custom properties rather than
 * React state, so tracking the cursor never triggers a re-render.
 *
 * The listener is on `window` rather than the element itself — this is a
 * single instance per mounted screen, the same shape as NetworkMesh's own
 * `resize` listener, not the "attach only while hovered" constraint that
 * matters when the same effect is repeated across many small elements (see
 * Button's magnetic hover). Containment is structural instead: the root is
 * `absolute inset-0 overflow-hidden`, clipped to whatever positioned
 * ancestor it's mounted inside, so the glow is only ever visible inside the
 * box the caller puts it in.
 */
const AmbientGlow = ({ className }) => {
    const glowRef = useRef(null);

    useEffect(() => {
        const el = glowRef.current;
        if (!el) return undefined;

        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduceMotion) return undefined;

        let frameId = null;
        let pending = false;
        let lastX = 0;
        let lastY = 0;

        const handleMove = (event) => {
            lastX = event.clientX;
            lastY = event.clientY;
            if (pending) return;
            pending = true;
            frameId = requestAnimationFrame(() => {
                const rect = el.getBoundingClientRect();
                el.style.setProperty('--glow-x', `${lastX - rect.left}px`);
                el.style.setProperty('--glow-y', `${lastY - rect.top}px`);
                pending = false;
            });
        };

        window.addEventListener('pointermove', handleMove);

        return () => {
            window.removeEventListener('pointermove', handleMove);
            if (frameId) cancelAnimationFrame(frameId);
        };
    }, []);

    return (
        <div
            ref={glowRef}
            aria-hidden="true"
            className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
            style={{ '--glow-x': '50%', '--glow-y': '30%' }}
        >
            <div
                className="absolute h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-brand opacity-[0.08] blur-[110px]"
                style={{ left: 'var(--glow-x)', top: 'var(--glow-y)' }}
            />
        </div>
    );
};

export default AmbientGlow;
