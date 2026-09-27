import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import NetworkMesh from '../components/ui/NetworkMesh';
import AmbientGlow from '../components/ui/AmbientGlow';
import { useAuth } from '../context/AuthContext';
import { ROUTES, HOME_ROUTE } from '../constants/routes';

/**
 * The entry screen at `/`.
 *
 * Plays a short launch sequence while the silent session refresh resolves,
 * then routes a signed-in user to Home and everyone else to sign in. The
 * timers only start once `isCheckingAuth` settles, so the destination is
 * always decided from the real session state, never a stale one.
 */
const STAGES = {
    booting: {
        title: 'Launching experience',
        subtitle: 'Setting up a smooth and secure start.',
        status: 'Initializing',
    },
    personalizing: {
        title: 'Preparing your workspace',
        subtitle: 'Syncing your access and getting things ready.',
        status: 'Secure access found',
    },
    welcome: {
        title: 'Welcome',
        subtitle: 'Taking you to the right place to continue.',
        status: 'Ready to continue',
    },
};

const FACTS = [
    ['Access', 'Verified'],
    ['Session', 'Protected'],
    ['Launch', 'Smooth'],
];

const SplashScreen = () => {
    const navigate = useNavigate();
    const { isAuthenticated, isCheckingAuth } = useAuth();
    const [stage, setStage] = useState('booting');

    useEffect(() => {
        if (isCheckingAuth) return undefined;

        const stageTimer = setTimeout(() => {
            setStage(isAuthenticated ? 'personalizing' : 'welcome');
        }, 700);

        const redirectTimer = setTimeout(() => {
            navigate(isAuthenticated ? HOME_ROUTE : ROUTES.LOGIN, { replace: true });
        }, 1200);

        return () => {
            clearTimeout(stageTimer);
            clearTimeout(redirectTimer);
        };
    }, [isAuthenticated, isCheckingAuth, navigate]);

    const current = STAGES[stage];

    return (
        <div className="relative h-screen w-screen overflow-hidden bg-canvas text-text">
            <div className="absolute inset-0 opacity-40">
                <NetworkMesh density="subtle" />
            </div>
            <div className="absolute inset-0 opacity-[0.35] [background-image:linear-gradient(var(--color-border)_1px,transparent_1px),linear-gradient(90deg,var(--color-border)_1px,transparent_1px)] [background-size:72px_72px]" />
            <AmbientGlow />
            <div className="absolute -left-[120px] top-20 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
            <div className="absolute -right-[100px] bottom-0 h-80 w-80 rounded-full bg-positive/10 blur-3xl" />

            <div className="relative z-10 flex h-full w-full overflow-y-auto px-4 sm:px-6">
                <div className="m-auto w-full max-w-lg py-8" role="status" aria-live="polite">
                    <div className="rounded-[32px] border border-border-glass bg-surface-glass px-6 py-10 shadow-overlay backdrop-blur-2xl sm:px-8">
                        <div className="flex flex-col items-center text-center">
                            <div className="relative mb-8">
                                <div className="absolute inset-0 rounded-[28px] bg-accent/20 blur-2xl" />
                                <div className="relative grid h-20 w-20 place-items-center overflow-hidden rounded-[24px] bg-gradient-brand text-on-accent shadow-glow-accent animate-loader-reveal">
                                    <span className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/50 to-transparent animate-shimmer-sweep" />
                                    <ShieldCheck size={38} strokeWidth={1.8} aria-hidden="true" />
                                </div>
                                <div className="absolute -inset-3 animate-pulse rounded-[32px] border border-accent-border" />
                            </div>

                            <div className="space-y-3">
                                <p className="text-xs font-medium uppercase tracking-[0.28em] text-accent-text">
                                    Secure platform
                                </p>
                                <h1 className="text-3xl font-semibold tracking-tight text-text sm:text-4xl">
                                    {current.title}
                                </h1>
                                <p className="mx-auto max-w-md text-sm leading-7 text-text-muted sm:text-base">
                                    {current.subtitle}
                                </p>
                            </div>

                            <div className="mt-8 w-full max-w-sm">
                                <div className="relative h-2 overflow-hidden rounded-pill bg-surface-active">
                                    <div className="absolute inset-y-0 left-0 w-1/3 rounded-pill bg-gradient-brand animate-splash-progress" />
                                </div>
                            </div>

                            <div className="mt-6 inline-flex items-center gap-3 rounded-pill border border-border-glass bg-surface-glass px-4 py-2 text-sm text-text-secondary">
                                <span className="relative flex h-2.5 w-2.5">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-positive opacity-75" />
                                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-positive" />
                                </span>
                                {current.status}
                            </div>

                            <div className="mt-10 grid w-full grid-cols-3 gap-3 text-left">
                                {FACTS.map(([label, value]) => (
                                    <div
                                        key={label}
                                        className="rounded-card border border-border-glass bg-surface-glass p-3 sm:p-4"
                                    >
                                        <p className="text-2xs uppercase tracking-[0.18em] text-text-muted">
                                            {label}
                                        </p>
                                        <p className="mt-2 text-sm font-medium text-text">{value}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SplashScreen;
