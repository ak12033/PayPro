import React from 'react';
import cn from '../../lib/cn';

/**
 * Loading placeholder.
 *
 * Uses the sweeping `.skeleton` utility rather than `animate-pulse`: a pulsing
 * block is the same visual language browsers and OSes use for *errors* and
 * *alerts*, and a screen full of pulsing red-adjacent rectangles is not what
 * you want to show someone who just opened their banking app.
 */
const Skeleton = ({ className, rounded = 'rounded-control' }) => (
    <div aria-hidden="true" className={cn('skeleton', rounded, className)} />
);

/**
 * Placeholder for a list of rows.
 *
 * Skeletons must mirror the shape of what is coming, otherwise the layout jumps
 * when the data lands — and a layout that jumps on a screen showing your
 * balance is a layout that gets mis-clicked.
 */
export const SkeletonRows = ({ count = 4, className }) => (
    <div className={cn('space-y-1', className)} role="status" aria-label="Loading">
        {Array.from({ length: count }, (_, index) => (
            <div key={index} className="flex items-center gap-3 px-3 py-3">
                <Skeleton className="h-10 w-10 shrink-0" rounded="rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-2/5" />
                    <Skeleton className="h-3 w-1/4" />
                </div>
                <Skeleton className="h-4 w-16 shrink-0" />
            </div>
        ))}
    </div>
);

export default Skeleton;
