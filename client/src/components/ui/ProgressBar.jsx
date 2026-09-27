import React from 'react';
import cn from '../../lib/cn';

/**
 * Accessible linear progress bar for budgets and goals.
 *
 * Generalised out of `features/security/SecurityScore.jsx`'s inline
 * `role="progressbar"` div — that pattern (not a "score meter"/SVG ring;
 * SecurityScore is a linear bar, plan.md's file map notwithstanding) is
 * exactly what a budget or goal needs, so it becomes the one shared
 * implementation instead of a second hand-written copy.
 *
 * Tone is auto-derived from percent per plan.md §13.6's bands unless the
 * caller overrides it — colour is never the only signal an over-budget state
 * gets: pair this with visible text stating the amounts, per the same
 * section's accessibility rule.
 */
const toneForPercent = (percent) => {
    if (percent > 100) return 'negative';
    if (percent >= 81) return 'warning';
    if (percent >= 51) return 'accent';
    return 'positive';
};

const TONE_CLASSES = {
    positive: 'bg-positive',
    accent: 'bg-accent',
    warning: 'bg-warning',
    negative: 'bg-negative',
};

const ProgressBar = ({ value, max, tone, label, className }) => {
    const percent = max > 0 ? (value / max) * 100 : 0;
    const resolvedTone = tone || toneForPercent(percent);
    const overflow = percent > 100;

    return (
        <div
            role="progressbar"
            aria-valuenow={Math.round(Math.min(value, max))}
            aria-valuemin={0}
            aria-valuemax={max}
            aria-label={label}
            className={cn('relative h-1.5 overflow-hidden rounded-pill bg-border', className)}
        >
            <div
                className={cn(
                    'h-full rounded-pill transition-[width,background-color] duration-[--duration-slow] ease-[--ease-out]',
                    TONE_CLASSES[resolvedTone]
                )}
                style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
            />
            {/* Over-limit renders as a distinct end-cap rather than just a
                fuller bar — "at the limit" and "over the limit" must look
                different, and a bar has no room to spatially exceed 100%. */}
            {overflow && (
                <div
                    aria-hidden="true"
                    className="absolute inset-y-0 right-0 w-1.5 rounded-r-pill bg-negative"
                />
            )}
        </div>
    );
};

export default ProgressBar;
