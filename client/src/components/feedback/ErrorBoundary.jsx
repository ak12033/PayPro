import React from 'react';
import { ROUTES } from '../../constants/routes';
import { reportError } from '../../services/errorTracking';

/**
 * Top-level error boundary.
 *
 * Without one, any render-time exception anywhere in the tree unmounts the
 * entire application and leaves the user on a blank white page with no
 * explanation and no way back.
 *
 * Uses `window.location.assign` rather than the router, because the boundary
 * sits above the router and has no navigate available to it.
 */
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error, info) {
        console.error('Unhandled UI error:', error, info);
        reportError(error, { componentStack: info?.componentStack });
    }

    render() {
        if (!this.state.hasError) return this.props.children;

        return (
            <div className="flex min-h-screen items-center justify-center bg-canvas px-4 text-text">
                <div className="w-full max-w-md rounded-panel border border-border-glass bg-surface-glass p-8 text-center backdrop-blur-xl">
                    <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-card border border-danger/20 bg-danger-soft text-2xl">
                        ⚠️
                    </div>
                    <h1 className="text-xl font-semibold">Something went wrong</h1>
                    <p className="mt-3 text-sm leading-6 text-text-secondary">
                        The page hit an unexpected error. Your account and balance are unaffected.
                    </p>
                    <button
                        onClick={() => window.location.assign(ROUTES.DASHBOARD)}
                        className="mt-6 w-full rounded-card bg-gradient-brand py-3 text-sm font-semibold text-on-accent shadow-glow-accent"
                    >
                        Back to dashboard
                    </button>
                </div>
            </div>
        );
    }
}

export default ErrorBoundary;
