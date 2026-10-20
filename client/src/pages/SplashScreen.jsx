import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import FullScreenLoader from '../components/feedback/FullScreenLoader';
import { useAuth } from '../context/AuthContext';
import { prefetchAppShell, prefetchRoute } from '../app/routePrefetch';
import { ROUTES, HOME_ROUTE } from '../constants/routes';

/**
 * The entry screen at `/`.
 *
 * Holds the brand loader while the silent session refresh resolves, then
 * routes a signed-in user to Home and everyone else to sign in. The redirect
 * timer only starts once `isCheckingAuth` settles, so the destination is
 * always decided from the real session state, never a stale one.
 *
 * It renders FullScreenLoader rather than a screen of its own. This used to be
 * a separate card with its own badge and staged copy, and any route loader
 * that followed it (a cold chunk, the auth guard) then looked like a second
 * splash. Sharing the component means the two join one animation timeline
 * (see FullScreenLoader) and read as a single launch.
 */
const MIN_VISIBLE_MS = 1200;

const SplashScreen = () => {
    const navigate = useNavigate();
    const { isAuthenticated, isCheckingAuth } = useAuth();

    // Fetch the signed-in destination while the splash is still up, so the
    // hand-off is not followed by a wait on the shell and Home chunks.
    useEffect(() => {
        if (!isAuthenticated) return;
        prefetchAppShell();
        prefetchRoute(HOME_ROUTE);
    }, [isAuthenticated]);

    useEffect(() => {
        if (isCheckingAuth) return undefined;

        const redirectTimer = setTimeout(() => {
            navigate(isAuthenticated ? HOME_ROUTE : ROUTES.LOGIN, { replace: true });
        }, MIN_VISIBLE_MS);

        return () => clearTimeout(redirectTimer);
    }, [isAuthenticated, isCheckingAuth, navigate]);

    const message = isCheckingAuth
        ? 'Starting PayPro…'
        : isAuthenticated
            ? 'Welcome back'
            : 'Taking you to sign in…';

    return <FullScreenLoader message={message} srLabel="Loading PayPro" />;
};

export default SplashScreen;
