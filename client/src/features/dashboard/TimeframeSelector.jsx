import React from 'react';
import cn from '../../lib/cn';
import { RANGE_OPTIONS } from './dashboardFormat';

/**
 * One filter row above everything it scopes.
 *
 * A single instance drives every chart on the dashboard via a lifted `range`
 * value in Home.jsx — per-chart timeframe pickers would let cards disagree
 * about which period they're describing.
 */
const TimeframeSelector = ({ value, onChange, className }) => (
    <div
        role="group"
        aria-label="Select time range"
        className={cn(
            'inline-flex items-center gap-0.5 rounded-control border border-border bg-surface-sunken p-1',
            className
        )}
    >
        {RANGE_OPTIONS.map((option) => (
            <button
                key={option.value}
                type="button"
                onClick={() => onChange(option.value)}
                aria-pressed={value === option.value}
                className={cn(
                    'rounded-[calc(var(--radius-control)-4px)] px-2.5 py-1.5 text-xs font-semibold',
                    'transition-colors duration-(--duration-fast) ease-(--ease-out)',
                    // Matches SegmentedControl's selected treatment exactly —
                    // the two sit on the same screen and reading as two
                    // different controls was the old inconsistency.
                    value === option.value
                        ? 'bg-surface text-accent-text shadow-flat'
                        : 'text-text-muted hover:text-text'
                )}
            >
                {option.label}
            </button>
        ))}
    </div>
);

export default TimeframeSelector;
