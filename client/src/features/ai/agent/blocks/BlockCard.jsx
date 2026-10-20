import React from 'react';
import Card from '../../../../components/ui/Card';
import cn from '../../../../lib/cn';

/**
 * The frame every agent card shares: a labelled group (plan.md §25.5), so a
 * screen reader announces "Withdrawal, group" before reading what is in it.
 */
const BlockCard = React.forwardRef(function BlockCard({ label, className, children, ...rest }, ref) {
    return (
        <Card
            ref={ref}
            role="group"
            aria-label={label}
            padding="sm"
            className={cn('mt-2 text-sm', className)}
            {...rest}
        >
            {children}
        </Card>
    );
});

export default BlockCard;
