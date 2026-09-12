import React from 'react';
import cn from '../../lib/cn';
import Card from '../../components/ui/Card';
import Skeleton from '../../components/ui/Skeleton';

/**
 * Loading placeholder shaped like the chart it precedes, so data landing
 * doesn't jump the layout — the same reasoning as `SkeletonRows` for lists.
 */
const ChartCardSkeleton = ({ height = 'h-64', showHeader = true, className }) => (
    <Card className={className}>
        {showHeader && (
            <div className="mb-4 flex items-center justify-between gap-3">
                <div className="space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-44" />
                </div>
                <Skeleton className="h-7 w-20" rounded="rounded-control" />
            </div>
        )}
        <Skeleton className={cn('w-full', height)} rounded="rounded-card" />
    </Card>
);

export default ChartCardSkeleton;
