import React, { useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import LogoMark from '../../components/ui/LogoMark';
import NetworkMesh from '../../components/ui/NetworkMesh';
import AmbientGlow from '../../components/ui/AmbientGlow';
import { ROUTES } from '../../constants/routes';
import { APP_NAME } from '../../constants/app';

const BrandMark = ({ className = '' }) => (
    <Link to={ROUTES.WELCOME} className={`inline-flex items-center gap-2 rounded-control ${className}`}>
        <LogoMark size={32} />
        <span className="text-base font-semibold tracking-tight text-text">{APP_NAME}</span>
    </Link>
);

/** Never shrink below this, however short the window. */
const MIN_SCALE = 0.55;

/**
 * Scales `contentRef` with CSS `zoom` so its full height fits inside
 * `containerRef`. `zoom` (rather than `transform: scale`) keeps layout honest:
 * the content still fills its box's width and text re-wraps, instead of
 * shrinking into a corner. Iterates because a smaller zoom lets text wrap
 * wider, which shortens the content again.
 *
 * `stretch` re-expands the content to the container's full height afterwards,
 * so a `justify-between` column still pins its last block to the bottom.
 *
 * The content is observed as well as the container, so the form re-fits when
 * an error alert or the password hint appears. That cannot loop: a fit that
 * lands on the same size produces no further resize notification.
 */
const useFitToHeight = (containerRef, contentRef, { stretch = false } = {}) => {
    useLayoutEffect(() => {
        const container = containerRef.current;
        const content = contentRef.current;
        if (!container || !content) return undefined;

        const fit = () => {
            const available = container.clientHeight;
            // 0 while the panel is `display: none` below `lg`.
            if (!available) return;

            content.style.minHeight = '';
            let scale = 1;
            for (let attempt = 0; attempt < 4; attempt += 1) {
                content.style.zoom = String(scale);
                const height = content.getBoundingClientRect().height;
                if (height <= available + 0.5 || scale === MIN_SCALE) break;
                scale = Math.max(MIN_SCALE, scale * (available / height) * 0.99);
            }
            if (stretch) content.style.minHeight = `${available / scale}px`;
        };

        fit();
        const observer = new ResizeObserver(fit);
        observer.observe(container);
        observer.observe(content);
        document.fonts?.ready.then(fit);
        return () => observer.disconnect();
    }, [containerRef, contentRef, stretch]);
};

/**
 * Full-viewport, two-panel frame for Login and Signup.
 *
 * The left panel (context: badge, headline, a status card and three tiles)
 * only appears from `lg` up; below that the form takes the whole screen.
 * The frame is locked to the viewport and never scrolls: both panels are
 * always shown in full, zoomed down by `useFitToHeight` just enough to fit
 * the window. The form panel keeps an overflow fallback only for windows so
 * short that even `MIN_SCALE` isn't enough, so the submit button stays
 * reachable.
 */
const AuthSplitLayout = ({
    badge,
    eyebrow,
    headline,
    description,
    statusCard,
    highlights,
    title,
    subtitle,
    children,
}) => {
    const panelRef = useRef(null);
    const panelContentRef = useRef(null);
    const formPanelRef = useRef(null);
    const formContentRef = useRef(null);
    useFitToHeight(panelRef, panelContentRef, { stretch: true });
    useFitToHeight(formPanelRef, formContentRef);

    return (
        <div className="relative h-screen w-screen overflow-hidden bg-canvas text-text">
            {/* Backdrop: mesh, grid lines and two soft brand orbs. */}
            <div className="absolute inset-0 opacity-40">
                <NetworkMesh density="subtle" />
            </div>
            <div className="absolute inset-0 opacity-[0.35] [background-image:linear-gradient(var(--color-border)_1px,transparent_1px),linear-gradient(90deg,var(--color-border)_1px,transparent_1px)] [background-size:72px_72px]" />
            <AmbientGlow />
            <div className="absolute -left-[100px] top-16 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
            <div className="absolute -right-[80px] bottom-0 h-80 w-80 rounded-full bg-positive/10 blur-3xl" />

            <div className="relative z-10 grid h-full w-full lg:grid-cols-[1.05fr_0.95fr]">
                {/* ---------------------------------------------- left panel */}
                <aside
                    ref={panelRef}
                    className="hidden overflow-hidden border-r border-border-glass bg-surface-glass backdrop-blur-xl lg:flex"
                >
                    {/* `self-start`: as a stretched flex item this would always
                        measure exactly the panel's height, and never zoom. */}
                    <div
                        ref={panelContentRef}
                        className="flex w-full flex-col justify-between gap-8 self-start px-10 py-10 xl:px-14"
                    >
                        <div>
                            <BrandMark className="mb-8" />

                            <div className="mb-8 flex">
                                <div className="inline-flex items-center gap-3 rounded-pill border border-border-glass bg-surface px-4 py-2 text-sm text-text-secondary shadow-raised">
                                    <span className="h-2.5 w-2.5 rounded-full bg-positive shadow-[0_0_14px_var(--color-positive)]" />
                                    {badge}
                                </div>
                            </div>

                            <div className="max-w-md">
                                <p className="mb-3 text-sm uppercase tracking-[0.22em] text-accent-text">{eyebrow}</p>
                                <h1 className="text-4xl font-semibold leading-tight text-text">{headline}</h1>
                                <p className="mt-4 text-base leading-7 text-text-secondary">{description}</p>
                            </div>
                        </div>

                        <div className="grid gap-4">
                            <div className="rounded-3xl border border-border bg-surface p-4">
                                <div className="mb-3 flex items-center justify-between">
                                    <span className="text-text-secondary">{statusCard.label}</span>
                                    <span className="rounded-pill bg-positive-soft px-3 py-1 text-xs font-semibold text-positive">
                                        {statusCard.status}
                                    </span>
                                </div>
                                <div className="text-2xl font-semibold text-text">{statusCard.title}</div>
                                <p className="mt-1 text-sm text-text-muted">{statusCard.body}</p>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                {highlights.map(([label, value, caption]) => (
                                    <div
                                        key={label}
                                        className="rounded-card border border-border bg-surface p-4 shadow-raised"
                                    >
                                        <p className="text-xs uppercase tracking-[0.18em] text-text-muted">{label}</p>
                                        <p className="mt-2 text-lg font-semibold text-text">{value}</p>
                                        <p className="mt-1 text-xs text-text-muted">{caption}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </aside>

                {/* ---------------------------------------------- form panel */}
                <main ref={formPanelRef} className="flex overflow-y-auto">
                    <div ref={formContentRef} className="m-auto w-full max-w-md px-4 py-4 sm:px-6">
                        <div className="rounded-[28px] border border-border bg-surface p-6 shadow-raised sm:px-8 sm:py-7">
                            <BrandMark className="mb-5 lg:hidden" />

                            <div className="mb-5">
                                <h2 className="text-2xl font-semibold tracking-tight text-text">{title}</h2>
                                <p className="mt-1 text-sm text-text-muted">{subtitle}</p>
                            </div>

                            {children}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default AuthSplitLayout;
