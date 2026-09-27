import React from 'react';
import cn from '../../lib/cn';

/**
 * A score, as a bar with the number stated in words beside it.
 *
 * plan.md §25.2 asks for this: `SecurityScore` already had an accessible
 * `role="progressbar"` bar inline, and the financial-health score needs the
 * same thing, so it becomes one component with two data sources rather than a
 * second hand-written copy that drifts.
 *
 * Three rules it enforces for both callers:
 *
 *   - **The number is never only a colour.** `caption` renders as text next to
 *     the bar, so a red fill is reinforcement rather than the sole signal —
 *     the same requirement §13.6 puts on budget bars, and the reason
 *     `ProgressBar` takes a visible label too.
 *   - **An unknown score is not a zero.** `value={null}` renders an explicitly
 *     unscored state, because §25.1's "never invent a score from missing data"
 *     is defeated the moment the UI draws an empty bar that reads as 0/100.
 *   - **`aria-valuenow` is omitted when there is no value**, which is what
 *     tells a screen reader "indeterminate" rather than "zero".
 *
 * This is distinct from `ProgressBar`: that one measures *progress toward a
 * target a user chose* (a budget limit, a goal) and derives its tone from how
 * close to that limit they are — over 100% is bad. A score is a judgement on a
 * fixed 0-100 scale where higher is better. Sharing one component would mean
 * one of the two lying about what its colour means.
 */

const TONE_CLASSES = {
    positive: 'bg-positive',
    accent: 'bg-accent',
    warning: 'bg-warning',
    negative: 'bg-negative',
};

/** Higher is better — the inverse of `ProgressBar`'s bands. */
export const toneForScore = (score) => {
    if (score === null || score === undefined) return 'accent';
    if (score >= 80) return 'positive';
    if (score >= 60) return 'accent';
    if (score >= 40) return 'warning';
    return 'negative';
};

const ScoreMeter = ({
    value,
    max = 100,
    tone,
    label,
    caption,
    /** Shown in place of the number when `value` is null. */
    emptyText = 'Not enough data yet',
    className,
}) => {
    const unscored = value === null || value === undefined;
    const resolvedTone = tone || toneForScore(value);
    const percent = unscored ? 0 : Math.min(100, Math.max(0, (value / max) * 100));

    return (
        <div className={className}>
            <div
                role="progressbar"
                // Omitted entirely when unscored: a `0` here would be read out
                // as a genuine score of zero.
                {...(!unscored && { 'aria-valuenow': Math.round(value) })}
                aria-valuemin={0}
                aria-valuemax={max}
                aria-label={label}
                aria-valuetext={unscored ? emptyText : undefined}
                className="h-1.5 overflow-hidden rounded-pill bg-border"
            >
                <div
                    className={cn(
                        'h-full rounded-pill transition-[width,background-color] duration-[--duration-slow] ease-[--ease-out]',
                        TONE_CLASSES[resolvedTone]
                    )}
                    style={{ width: `${percent}%` }}
                />
            </div>

            {caption && <p className="mt-2 text-xs text-text-muted">{caption}</p>}
        </div>
    );
};

export default ScoreMeter;
