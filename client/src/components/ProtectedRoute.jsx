import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import FullScreenLoader from './feedback/FullScreenLoader';
import { ROUTES } from '../constants/routes';

/**
 * Route guard.
 *
 * There was previously none: every authenticated screen rendered for anyone who
 * typed the URL. The pages mounted, fired their API calls, took 401s, and left
 * the user staring at a fully-drawn wallet shell with empty data — while the
 * axios interceptor churned through a refresh attempt for a session that did
 * not exist.
 *
 * `isCheckingAuth` matters: without it the guard bounces every user to /login on
 * a hard refresh, because the silent refresh has not completed on first render.
 */
const ProtectedRoute = () => {
    const { isAuthenticated, isCheckingAuth } = useAuth();
    const location = useLocation();

    if (isCheckingAuth) {
        return <FullScreenLoader message="Restoring your session…" />;
    }

    if (!isAuthenticated) {
        // `state.from` lets the login page return the user to where they meant
        // to go instead of always dumping them on the home screen.
        return <Navigate to={ROUTES.LOGIN} replace state={{ from: location.pathname }} />;
    }

    return <Outlet />;
};

export default ProtectedRoute;
