import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import cn from '../../lib/cn';
import { IconButton } from '../ui/Button';

/**
 * The opening block of a page.
 *
 * Reduced to a title, an optional one-line subtitle, and an action slot. The
 * previous header rendered an uppercase letter-spaced eyebrow, a 36px title, a
 * two-line description and a row of "meta tiles" — roughly 200px of chrome
 * before the first piece of real content, repeated on six screens.
 *
 * The eyebrow is gone entirely. It said "Wallet funding" above a title that
 * said "Add money": the same information twice, the second time in a typeface
 * optimised for being hard to read.
 */
const PageHeader = ({
    title,
    subtitle,
    action,
    /** Renders a back affordance. Pass a path, or `true` for history.back(). */
    back,
    className,
}) => {
    const navigate = useNavigate();

    return (
        <div className={cn('mb-5 flex items-start gap-3', className)}>
            {back && (
                <IconButton
                    label="Go back"
                    size="sm"
                    className="-ml-2 mt-0.5 shrink-0"
                    onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
                >
                    <ArrowLeft size={18} />
                </IconButton>
            )}

            <div className="min-w-0 flex-1">
                {/*
                 * Exactly one <h1> per page, and it lives here. Several screens
                 * previously rendered an <h1> of their own *underneath* the
                 * topbar's <h1>, so every page had two top-level headings and a
                 * screen reader's document outline was meaningless.
                 */}
                <h1 className="text-xl font-semibold tracking-tight text-text sm:text-2xl">
                    {title}
                </h1>
                {subtitle && <p className="mt-1 text-sm leading-6 text-text-muted">{subtitle}</p>}
            </div>

            {action && <div className="shrink-0">{action}</div>}
        </div>
    );
};

/**
 * Sub-heading inside a page, above a group of cards or a list.
 *
 * `id` exists so a wrapping <section> can point `aria-labelledby` at this
 * heading. Without it the pattern becomes "render a visible heading, then a
 * second visually-hidden one for the section label" — which puts two headings
 * with the same text into the accessibility tree and makes a screen reader's
 * heading list read every section twice.
 */
export const SectionHeading = ({ id, title, action, className }) => (
    <div className={cn('mb-2.5 flex items-center justify-between gap-3', className)}>
        <h2 id={id} className="text-sm font-semibold text-text">
            {title}
        </h2>
        {action}
    </div>
);

export default PageHeader;
