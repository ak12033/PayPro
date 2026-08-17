import React from 'react';
import cn from '../../lib/cn';

const TONES = {
    neutral: 'bg-surface-sunken text-text-muted border-border',
    positive: 'bg-positive-soft text-positive border-transparent',
    negative: 'bg-negative-soft text-negative border-transparent',
    warning: 'bg-warning-soft text-warning border-transparent',
    info: 'bg-info-soft text-info border-transparent',
    accent: 'bg-accent-soft text-accent-text border-transparent',
    ai: 'bg-ai-soft text-ai border-transparent',
};

/**
 * Small status label.
 *
 * A `dot` is available for statuses that are genuinely about state (pending,
 * captured, failed). It exists so status is not signalled by hue alone — the
 * old payment-status pills were four differently-coloured chips whose text was
 * the only real differentiator anyway, and to a monochrome or colour-blind
 * reader they were identical.
 */
const Badge = ({ tone = 'neutral', dot = false, size = 'md', className, children }) => (
    <span
        className={cn(
            'inline-flex items-center gap-1.5 rounded-pill border font-medium',
            size === 'sm' ? 'px-2 py-0.5 text-2xs' : 'px-2.5 py-1 text-xs',
            TONES[tone],
            className
        )}
    >
        {dot && (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
        )}
        {children}
    </span>
);

export default Badge;
