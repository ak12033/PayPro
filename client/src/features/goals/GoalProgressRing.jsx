import React from 'react';

/**
 * SVG progress ring for a goal's percent-to-target. Genuinely new geometry —
 * there is no ring precedent elsewhere in the codebase (`SecurityScore` is a
 * linear bar) — but a single "percent to one target" number reads better as
 * a ring than a bar, which is why goals get one and budgets don't.
 */
const SIZE = 64;
const STROKE = 6;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const toneVar = (percent) => {
    if (percent >= 100) return 'var(--color-positive)';
    if (percent >= 60) return 'var(--color-accent)';
    return 'var(--color-viz-1, var(--color-accent))';
};

const GoalProgressRing = ({ value, max, label }) => {
    const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0;
    const offset = CIRCUMFERENCE - (percent / 100) * CIRCUMFERENCE;

    return (
        <div
            role="progressbar"
            aria-valuenow={Math.round(Math.min(value, max))}
            aria-valuemin={0}
            aria-valuemax={max}
            aria-label={label}
            className="relative inline-grid place-items-center"
            style={{ width: SIZE, height: SIZE }}
        >
            <svg width={SIZE} height={SIZE} className="-rotate-90">
                <circle
                    cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
                    fill="none" stroke="var(--color-border)" strokeWidth={STROKE}
                />
                <circle
                    cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
                    fill="none" stroke={toneVar(percent)} strokeWidth={STROKE}
                    strokeDasharray={CIRCUMFERENCE}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    className="transition-[stroke-dashoffset] duration-(--duration-slow) ease-(--ease-out)"
                />
            </svg>
            <span className="absolute text-xs font-semibold text-text" aria-hidden="true">
                {Math.round(percent)}%
            </span>
        </div>
    );
};

export default GoalProgressRing;
