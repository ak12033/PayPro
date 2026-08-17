import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Lock, Sparkles, Zap } from 'lucide-react';
import Button from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { ROUTES, HOME_ROUTE } from '../constants/routes';
import { APP_NAME } from '../constants/app';

/**
 * The public entry point.
 *
 * Replaces a "splash screen" that ran a timed animation and then redirected —
 * a loading screen with nothing to load, which is a delay charged to every
 * visitor in exchange for nothing.
 *
 * A returning signed-in user never sees this at all: they are sent straight to
 * Home. The old flow made them watch the splash first, which is the wrong
 * priority for someone who opened the app to check a balance.
 */
const Landing = () => {
    const navigate = useNavigate();
    const { isAuthenticated, isCheckingAuth } = useAuth();

    useEffect(() => {
        if (!isCheckingAuth && isAuthenticated) {
            navigate(HOME_ROUTE, { replace: true });
        }
    }, [isAuthenticated, isCheckingAuth, navigate]);

    return (
        <div className="flex min-h-dvh flex-col bg-canvas px-5 py-8">
            <header className="mx-auto flex w-full max-w-4xl items-center justify-between">
                <div className="flex items-center gap-2">
                    <span
                        aria-hidden="true"
                        className="grid h-8 w-8 place-items-center rounded-control bg-accent text-on-accent"
                    >
                        <Sparkles size={17} />
                    </span>
                    <span className="text-base font-semibold tracking-tight text-text">
                        {APP_NAME}
                    </span>
                </div>

                <Link to={ROUTES.LOGIN}>
                    <Button variant="ghost" size="sm">
                        Sign in
                    </Button>
                </Link>
            </header>

            <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12 text-center">
                <h1 className="text-2xl font-semibold tracking-tight text-text sm:text-3xl">
                    Money that moves when you do
                </h1>
                <p className="mx-auto mt-3 max-w-sm text-base leading-7 text-text-secondary">
                    Send, receive and track your money in one place. No queues, no paperwork.
                </p>

                <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
                    <Link to={ROUTES.SIGNUP} className="sm:w-44">
                        <Button variant="primary" size="lg" fullWidth iconEnd={<ArrowRight size={17} />}>
                            Get started
                        </Button>
                    </Link>
                    <Link to={ROUTES.LOGIN} className="sm:w-44">
                        <Button variant="secondary" size="lg" fullWidth>
                            I have an account
                        </Button>
                    </Link>
                </div>

                {/* Three claims, each one concrete and true of the product as
                    built. Vague superlatives on a finance landing page erode
                    exactly the trust they are meant to build. */}
                <ul className="mx-auto mt-12 grid max-w-sm gap-4 text-left">
                    <Feature
                        icon={Zap}
                        title="Instant transfers"
                        description="Money reaches another PayPro account immediately."
                    />
                    <Feature
                        icon={Lock}
                        title="Verified transfers"
                        description="Confirm payments with an emailed code before they leave your wallet."
                    />
                    <Feature
                        icon={Sparkles}
                        title="Spending you can read"
                        description="Every transaction categorised, searchable and exportable."
                    />
                </ul>
            </main>
        </div>
    );
};

const Feature = ({ icon: Icon, title, description }) => (
    <li className="flex gap-3">
        <span
            aria-hidden="true"
            className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-text"
        >
            <Icon size={16} />
        </span>
        <span>
            <span className="block text-sm font-medium text-text">{title}</span>
            <span className="mt-0.5 block text-sm leading-6 text-text-muted">{description}</span>
        </span>
    </li>
);

export default Landing;
