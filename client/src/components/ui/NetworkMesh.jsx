import React, { useEffect, useRef } from 'react';
import { useTheme } from '../../app/theme/ThemeProvider';

/**
 * A drifting particle mesh used as a decorative backdrop.
 *
 * Reserved for the two places a first-time visitor forms an impression before
 * they have any real data to look at — the landing hero and the auth screens
 * — never the authenticated dashboard, where the busiest screen in the
 * product has no bandwidth to spend on decoration.
 *
 * Plain 2D canvas, not WebGL: the effect is a handful of connected dots with
 * a fake-depth scale factor, which canvas draws in a fraction of the code
 * (and CPU) a real 3D scene would need for the same visual result.
 *
 * Two things the original concept sketch this was adapted from did not do:
 * it never checks `prefers-reduced-motion`, and it always draws the same
 * particle count regardless of viewport. Both are handled here — the
 * animation loop simply never starts for a user who has asked for less
 * motion, and mobile gets a lighter mesh rather than a scaled-down desktop one.
 */
const NetworkMesh = ({ density = 'normal', className }) => {
    const canvasRef = useRef(null);
    const { isDark } = useTheme();

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return undefined;

        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const isNarrow = window.innerWidth < 640;

        const ctx = canvas.getContext('2d');
        let width = (canvas.width = canvas.offsetWidth * window.devicePixelRatio);
        let height = (canvas.height = canvas.offsetHeight * window.devicePixelRatio);

        const baseCount = density === 'subtle' ? 28 : 60;
        const particleCount = isNarrow ? Math.round(baseCount * 0.4) : baseCount;

        const particles = Array.from({ length: particleCount }, () => ({
            x: (Math.random() - 0.5) * width * 0.9,
            y: (Math.random() - 0.5) * height * 0.9,
            z: Math.random() * width * 0.5,
            radius: Math.random() * 1.6 + 0.8,
            vx: (Math.random() - 0.5) * 0.3,
            vy: (Math.random() - 0.5) * 0.3,
            vz: (Math.random() - 0.5) * 0.3,
            pulse: Math.random() * Math.PI * 2,
        }));

        // Link colour is the brand cyan, node colour the emerald at the far
        // end of the gradient — the mesh is the brand sweep taken apart into
        // particles. Read from the theme rather than restated as literals
        // here: canvas cannot use a CSS variable directly, but it can be
        // handed one that was resolved at draw time, which keeps this in step
        // with `--gradient-brand` instead of quietly drifting from it.
        const styles = getComputedStyle(document.documentElement);
        const linkColor = styles.getPropertyValue('--mesh-link').trim() || '8 145 178';
        const nodeColor = styles.getPropertyValue('--mesh-node').trim() || '5 150 105';

        const drawFrame = () => {
            ctx.clearRect(0, 0, width, height);
            const cx = width / 2;
            const cy = height / 2;

            for (let i = 0; i < particles.length; i += 1) {
                const p1 = particles[i];
                const scale1 = 300 / (300 + p1.z);
                const px1 = cx + p1.x * scale1;
                const py1 = cy + p1.y * scale1;

                for (let j = i + 1; j < particles.length; j += 1) {
                    const p2 = particles[j];
                    const scale2 = 300 / (300 + p2.z);
                    const px2 = cx + p2.x * scale2;
                    const py2 = cy + p2.y * scale2;
                    const dist = Math.hypot(px1 - px2, py1 - py2);

                    if (dist < 120) {
                        const alpha = (1 - dist / 120) * (density === 'subtle' ? 0.12 : 0.22);
                        ctx.beginPath();
                        ctx.moveTo(px1, py1);
                        ctx.lineTo(px2, py2);
                        ctx.strokeStyle = `rgb(${linkColor} / ${alpha})`;
                        ctx.lineWidth = 1;
                        ctx.stroke();
                    }
                }

                const nodeAlpha = 0.35 + Math.sin(p1.pulse) * 0.25;
                ctx.beginPath();
                ctx.arc(px1, py1, p1.radius * scale1 * 1.5, 0, Math.PI * 2);
                ctx.fillStyle = `rgb(${nodeColor} / ${nodeAlpha * (density === 'subtle' ? 0.6 : 1)})`;
                ctx.fill();
            }
        };

        if (reduceMotion) {
            drawFrame();
            return undefined;
        }

        let frameId;
        const tick = () => {
            for (const p of particles) {
                p.x += p.vx;
                p.y += p.vy;
                p.z += p.vz;
                p.pulse += 0.02;
                if (Math.abs(p.x) > width * 0.5) p.vx *= -1;
                if (Math.abs(p.y) > height * 0.5) p.vy *= -1;
                if (p.z < 0 || p.z > width * 0.5) p.vz *= -1;
            }
            drawFrame();
            frameId = requestAnimationFrame(tick);
        };
        frameId = requestAnimationFrame(tick);

        const handleResize = () => {
            width = canvas.width = canvas.offsetWidth * window.devicePixelRatio;
            height = canvas.height = canvas.offsetHeight * window.devicePixelRatio;
        };
        window.addEventListener('resize', handleResize);

        return () => {
            cancelAnimationFrame(frameId);
            window.removeEventListener('resize', handleResize);
        };
    }, [isDark, density]);

    return (
        <canvas
            ref={canvasRef}
            aria-hidden="true"
            className={className ?? 'pointer-events-none absolute inset-0 h-full w-full'}
        />
    );
};

export default NetworkMesh;
