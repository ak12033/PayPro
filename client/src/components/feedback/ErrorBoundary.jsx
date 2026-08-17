import React from 'react';
import { ROUTES } from '../../constants/routes';

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
    }

    render() {
        if (!this.state.hasError) return this.props.children;

        return (
            <div className="flex min-h-screen items-center justify-center bg-[#07111f] px-4 text-white">
                <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center">
                    <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-400/20 bg-red-500/10 text-2xl">
                        ⚠️
                    </div>
                    <h1 className="text-xl font-semibold">Something went wrong</h1>
                    <p className="mt-3 text-sm leading-6 text-slate-400">
                        The page hit an unexpected error. Your account and balance are unaffected.
                    </p>
                    <button
                        onClick={() => window.location.assign(ROUTES.DASHBOARD)}
                        className="mt-6 w-full rounded-2xl bg-[linear-gradient(135deg,#67e8f9_0%,#38bdf8_45%,#3b82f6_100%)] py-3 text-sm font-semibold text-slate-950"
                    >
                        Back to dashboard
                    </button>
                </div>
            </div>
        );
    }
}

export default ErrorBoundary;
