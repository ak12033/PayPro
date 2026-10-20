import { ROUTES } from '../constants/routes';

/**
 * Warms a screen's code-split chunk before it is navigated to.
 *
 * Every authenticated screen is `lazy()` (App.jsx), which keeps the first load
 * small but means the first click on each nav item waited on a chunk download
 * before anything moved. Starting that download when intent shows (the pointer
 * reaching a link, a keyboard focus, a touch beginning) hides most of it
 * behind the time a click takes; warming the main destinations while the
 * browser is idle hides the rest.
 *
 * These are the same specifiers App.jsx passes to `lazy()`, so the bundler
 * maps both to one chunk and the module cache makes the later `lazy()` call
 * resolve immediately. Only nav targets are listed: a screen reached from
 * inside another screen is fetched on demand as before.
 */
const LOADERS = {
    [ROUTES.HOME]: () => import('../pages/Home'),
    [ROUTES.MONEY]: () => import('../pages/money/MoneyHub'),
    [ROUTES.ACTIVITY]: () => import('../pages/Activity'),
    [ROUTES.ACCOUNT]: () => import('../pages/account/Account'),
    [ROUTES.INSIGHTS]: () => import('../pages/Insights'),
    [ROUTES.SECURITY]: () => import('../pages/account/Security'),
    [ROUTES.ADD_MONEY]: () => import('../pages/money/AddMoney'),
};

const started = new Set();

/** Starts loading `path`'s chunk once. Safe to call on every pointer event. */
export const prefetchRoute = (path) => {
    const load = LOADERS[path];
    if (!load || started.has(path)) return;
    started.add(path);
    // A failed prefetch is not an error: navigation retries the import, and
    // that attempt surfaces any real failure through the error boundary.
    load().catch(() => started.delete(path));
};

let shellStarted = false;

/**
 * Starts loading the authenticated layout once. It wraps every nav target, so
 * the entry splash warms it alongside Home for a user it knows is signed in.
 */
export const prefetchAppShell = () => {
    if (shellStarted) return;
    shellStarted = true;
    import('../components/shell/AppShell').catch(() => { shellStarted = false; });
};

/** Props that prefetch `path` on hover, keyboard focus or the start of a tap. */
export const prefetchProps = (path) => {
    const warm = () => prefetchRoute(path);
    return { onPointerEnter: warm, onFocus: warm, onTouchStart: warm };
};

/**
 * Warms every primary destination once the browser has nothing better to do.
 * Skipped on a metered or data-saver connection, where downloading screens the
 * user may never open costs them real money.
 */
export const prefetchWhenIdle = (paths) => {
    if (typeof window === 'undefined') return () => {};
    if (navigator.connection?.saveData) return () => {};

    const run = () => paths.forEach(prefetchRoute);
    if ('requestIdleCallback' in window) {
        const id = window.requestIdleCallback(run, { timeout: 4000 });
        return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(run, 1500);
    return () => window.clearTimeout(id);
};
