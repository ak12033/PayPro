import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { ROUTES } from '../../constants/routes';
import { APP_NAME } from '../../constants/app';

/**
 * The frame around every unauthenticated screen.
 *
 * Single column, centred, roughly 380px wide. The screens this replaces were
 * split-panel layouts: a 4xl headline, a decorative grid pattern, two blurred
 * gradient orbs, a "trust badge" pill and three feature callouts, all beside a
 * form with two inputs.
 *
 * That composition is optimised for a marketing page, and a login screen is not
 * one. Everyone who reaches it has already decided to use the product — they
 * are trying to get *in*. Persuasion at this point is pure cost: it pushes the
 * form below the fold on a phone, it slows the render, and the visual noise
 * around a password field is, in a finance product, actively counterproductive
 * — an over-designed login page is what phishing sites look like.
 *
 * The reassurance that remains is factual and small, at the bottom, where a
 * genuinely cautious user goes looking for it.
 */
const AuthLayout = ({ title, subtitle, children, footer }) => (
    <div className="flex min-h-dvh flex-col bg-canvas px-4 py-8">
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
            <Link
                to={ROUTES.LANDING}
                className="mx-auto mb-7 inline-flex items-center gap-2 rounded-control"
            >
                <span
                    aria-hidden="true"
                    className="grid h-8 w-8 place-items-center rounded-control bg-accent text-on-accent"
                >
                    <Sparkles size={17} />
                </span>
                <span className="text-base font-semibold tracking-tight text-text">
                    {APP_NAME}
                </span>
            </Link>

            <div className="mb-6 text-center">
                <h1 className="text-xl font-semibold tracking-tight text-text">{title}</h1>
                {subtitle && <p className="mt-1.5 text-sm text-text-muted">{subtitle}</p>}
            </div>

            {children}

            {footer && <div className="mt-6 text-center text-sm">{footer}</div>}
        </div>

        <p className="mx-auto mt-8 max-w-sm text-center text-xs text-text-muted">
            Your session is protected with rotating tokens and optional two-step verification.
        </p>
    </div>
);

export default AuthLayout;
