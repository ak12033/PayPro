import { useEffect, useRef } from 'react';

/**
 * Subtle pointer-tracked 3D tilt for a single hero surface.
 *
 * Never attaches a listener at all on a touch device or under
 * `prefers-reduced-motion` — inert by construction rather than animating and
 * then suppressing itself, which is the same discipline NetworkMesh uses for
 * its canvas loop. The transform is written straight to the DOM node on every
 * `pointermove`, not through React state, so tilting never triggers a
 * re-render.
 *
 * The offset is a fraction of the element's own size (not a fixed pixel
 * divisor), so `maxDeg` is a real, size-independent cap rather than a angle
 * that grows with however large the card happens to be.
 */
export const usePointerTilt = ({ maxDeg = 6, perspective = 900 } = {}) => {
    const ref = useRef(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return undefined;

        const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!canHover || reduceMotion) return undefined;

        const handleMove = (event) => {
            const rect = el.getBoundingClientRect();
            const px = (event.clientX - rect.left) / rect.width - 0.5;
            const py = (event.clientY - rect.top) / rect.height - 0.5;
            const rotateY = px * maxDeg * 2;
            const rotateX = -py * maxDeg * 2;
            el.style.transform = `perspective(${perspective}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
        };

        const handleLeave = () => {
            el.style.transform = `perspective(${perspective}px) rotateX(0deg) rotateY(0deg)`;
        };

        el.addEventListener('pointermove', handleMove);
        el.addEventListener('pointerleave', handleLeave);

        return () => {
            el.removeEventListener('pointermove', handleMove);
            el.removeEventListener('pointerleave', handleLeave);
        };
    }, [maxDeg, perspective]);

    return { ref };
};

export default usePointerTilt;
