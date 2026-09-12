import React from 'react';
import cn from '../../lib/cn';

/**
 * The circular icon-in-a-soft-circle used to lead a feature bullet, a nav-out
 * card, or a flow's success screen.
 *
 * Every one of those was previously a hand-written `<span>` repeating the same
 * `h-N w-N rounded-full bg-{tone}-soft text-{tone}` classes — the success
 * screen alone had three verbatim copies across Send, Add money and transfer
 * verification. One component means a tone or size change is an edit here,
 * not a find-and-replace across a dozen pages.
 */
const TONES = {
    accent: 'bg-accent-soft text-accent-text',
    positive: 'bg-positive-soft text-positive',
    warning: 'bg-warning-soft text-warning',
    ai: 'bg-ai-soft text-ai',
    neutral: 'bg-surface-sunken text-text-secondary',
};

const SIZES = {
    sm: 'h-8 w-8',
    md: 'h-9 w-9',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16',
};

const IconBadge = ({ icon, tone = 'accent', size = 'md', pulse = false, className }) => (
    <span
        aria-hidden="true"
        className={cn(
            'inline-grid shrink-0 place-items-center rounded-full',
            TONES[tone],
            SIZES[size],
            // Reserved for the moment an action has just succeeded — not a
            // general-purpose entrance animation.
            pulse && 'animate-pop',
            className
        )}
    >
        {icon}
    </span>
);

export default IconBadge;
