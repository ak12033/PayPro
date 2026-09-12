import React from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { HOME_ROUTE, ROUTES } from '../constants/routes';

/**
 * 404.
 *
 * The destination of the primary button depends on whether there is a session —
 * sending a signed-out visitor to a protected home route just bounces them to
 * login, which turns one dead end into two.
 */
const NotFound = () => {
    const navigate = useNavigate();
    const { isAuthenticated } = useAuth();

    return (
        <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-canvas px-4">
            {/* A single blurred accent blob — the smallest possible dose of
                the brand's glow language, not a scene. */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent opacity-[0.08] blur-[100px]"
            />

            <div className="relative w-full max-w-sm text-center">
                <p className="text-sm font-medium text-text-muted">404</p>
                <h1 className="mt-2 text-xl font-semibold tracking-tight text-text">
                    Page not found
                </h1>
                <p className="mt-2 text-sm leading-6 text-text-muted">
                    This page doesn't exist or has moved. Your account is unaffected.
                </p>

                <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
                    <Button
                        variant="primary"
                        onClick={() => navigate(isAuthenticated ? HOME_ROUTE : ROUTES.LANDING)}
                    >
                        {isAuthenticated ? 'Go to home' : 'Go to start'}
                    </Button>
                    <Button variant="secondary" onClick={() => navigate(-1)}>
                        Go back
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default NotFound;
