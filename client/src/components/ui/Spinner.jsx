import React from 'react';
import cn from '../../lib/cn';

const SIZES = {
    sm: 'h-4 w-4 border-2',
    md: 'h-6 w-6 border-2',
    lg: 'h-8 w-8 border-[3px]',
};

/**
 * Indeterminate progress.
 *
 * `tone="current"` inherits the parent's colour, which is what lets a spinner
 * inside a primary button render white and the same component inside a card
 * render in the accent colour — without either call site hard-coding a hex.
 */
const Spinner = ({ size = 'md', tone = 'accent', className }) => (
    <span
        role="presentation"
        className={cn(
            'inline-block animate-spin rounded-full border-current border-t-transparent',
            tone === 'accent' && 'text-accent',
            tone === 'muted' && 'text-text-muted',
            SIZES[size],
            className
        )}
    />
);

export default Spinner;
