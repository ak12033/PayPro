import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useId,
    useLayoutEffect,
    useMemo,
    useState,
} from 'react';
import LogoMark from '../ui/LogoMark';
import NetworkMesh from '../ui/NetworkMesh';

/**
 * Full-viewport loading state, used by the entry splash, the auth guard while
 * the silent refresh is in flight, the role gate and the route Suspense
 * fallback.
 *
 * One loader, however many callers.
 *
 * A hard refresh on an authenticated route needs several of those in a row:
 * ProtectedRoute's while the session restores, then the Suspense fallback
 * while the AppShell and page chunks download (and RequireRole's on a console
 * route). Each was its own element in its own tree position, so React mounted
 * a fresh loader at every hand-off and the user watched the splash play two or
 * three times.
 *
 * So `FullScreenLoader` no longer draws anything itself when a host is
 * present. It *claims* the single loader that `FullScreenLoaderHost` renders
 * at the app root, and releases it on unmount. The claims swap inside one
 * commit (layout-effect cleanup, then setup), the host's count never reaches
 * zero, and the same loader stays on screen, animation and message intact,
 * until the last claim is released. It then fades out over EXIT_MS, which also
 * absorbs a claim that arrives a moment later instead of in the same commit.
 *
 * Without a host (isolated component tests) it renders the loader inline, as
 * it always did.
 *
 * This is deliberately not a timed splash screen — see Landing's header
 * comment for why the product had one and removed it. Dismissal is always the
 * last caller unmounting, never a timer owned by the loader.
 */
const EXIT_MS = 200;

const LoaderContext = createContext(null);

/**
 * `min-h-dvh` rather than `min-h-screen`: on mobile Safari, `100vh` is the
 * viewport *without* the browser chrome, so a full-height loader was taller
 * than the visible area and the mark sat slightly below centre.
 *
 * The mark's formation (blur/scale/light-sweep) plays once on mount and
 * settles into a sustained breathe/pulse/orbit loop, so the same markup reads
 * correctly whether the work behind it takes 100ms or several seconds.
 */
const LoaderView = ({ message, srLabel }) => (
    <div
        className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-canvas"
        role="status"
        aria-live="polite"
    >
        <div className="absolute inset-0 opacity-40">
            <NetworkMesh density="subtle" />
        </div>

        <div className="relative flex flex-col items-center gap-5">
            <div className="relative grid h-36 w-36 place-items-center">
                {/* Soft light forming behind the mark. */}
                <div className="absolute h-28 w-28 rounded-full bg-gradient-brand opacity-25 blur-2xl animate-loader-breathe" />

                {/* Two staggered rings radiating from the mark's own
                    footprint — reads as a system initializing rather than a
                    generic spinner, and `rounded-panel` keeps them the same
                    family of shape as the mark instead of a circular ping. */}
                <span className="absolute h-20 w-20 rounded-panel border border-accent-border animate-loader-pulse-ring" />
                <span
                    className="absolute h-20 w-20 rounded-panel border border-accent-border animate-loader-pulse-ring"
                    style={{ animationDelay: '1.2s' }}
                />

                {/* A single orbiting node — the wider neural network the
                    backdrop mesh sketches, condensed to one data point in
                    close orbit around the mark. */}
                <span className="absolute h-28 w-28 animate-loader-orbit" aria-hidden="true">
                    <span className="absolute -top-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-accent" />
                </span>

                {/* The mark itself — same brand badge as the landing header
                    and auth layout, scaled up for a hero moment rather than
                    replaced with anything invented. */}
                <span
                    aria-hidden="true"
                    className="relative grid h-20 w-20 place-items-center overflow-hidden rounded-panel border border-border bg-surface shadow-glow-accent animate-loader-reveal"
                >
                    <span className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/50 to-transparent animate-shimmer-sweep" />
                    <LogoMark size={60} className="relative" />
                </span>
            </div>

            {/* Always rendered so the mark does not jump when a message
                arrives; `min-h-5` holds the line while it is empty. */}
            <p className="min-h-5 text-sm text-text-muted">
                {message && (
                    <span key={message} className="animate-fade-in">{message}</span>
                )}
            </p>
        </div>

        <span className="sr-only">{srLabel}</span>
    </div>
);

/**
 * Renders the app's one full-screen loader above `children` while any
 * FullScreenLoader is mounted. Needs to sit inside ThemeProvider (the mesh
 * reads the theme).
 */
export const FullScreenLoaderHost = ({ children }) => {
    const [claims, setClaims] = useState([]);
    // The last message shown is kept for as long as the loader stays up, so a
    // message-less claim taking over (the route fallback after the session
    // guard) does not blank the line mid-load.
    const [lastMessage, setLastMessage] = useState(null);
    const [leaving, setLeaving] = useState(false);
    const active = claims.length > 0;

    const claim = useCallback((id, props) => {
        setClaims((current) => [...current.filter((c) => c.id !== id), { id, ...props }]);
        if (props.message) setLastMessage(props.message);
    }, []);

    const release = useCallback((id) => {
        setClaims((current) => current.filter((c) => c.id !== id));
    }, []);

    const api = useMemo(() => ({ claim, release }), [claim, release]);

    // Keep the loader mounted through its fade-out; a claim arriving during
    // the fade cancels it and the same loader simply carries on.
    useEffect(() => {
        if (active) {
            setLeaving(true);
            return undefined;
        }
        const id = setTimeout(() => {
            setLeaving(false);
            setLastMessage(null);
        }, EXIT_MS);
        return () => clearTimeout(id);
    }, [active]);

    const top = claims[claims.length - 1];
    const message = claims.findLast((c) => c.message)?.message ?? lastMessage;

    return (
        <LoaderContext.Provider value={api}>
            {children}
            {(active || leaving) && (
                <div
                    className={`fixed inset-0 z-[60] transition-opacity ease-out ${active ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
                    style={{ transitionDuration: `${EXIT_MS}ms` }}
                >
                    <LoaderView message={message} srLabel={top?.srLabel ?? 'Loading'} />
                </div>
            )}
        </LoaderContext.Provider>
    );
};

const FullScreenLoader = ({ message, srLabel = 'Loading' }) => {
    const host = useContext(LoaderContext);
    const id = useId();

    // A layout effect, so the claim lands before the browser paints: the
    // first frame already shows the loader, and a hand-off between two
    // callers never has a frame with neither.
    useLayoutEffect(() => {
        if (!host) return undefined;
        host.claim(id, { message, srLabel });
        return () => host.release(id);
    }, [host, id, message, srLabel]);

    return host ? null : <LoaderView message={message} srLabel={srLabel} />;
};

export default FullScreenLoader;
