import React from 'react';
import cn from '../../lib/cn';

/**
 * "Nothing here yet".
 *
 * Two distinct situations were previously drawn the same way, and conflating
 * them is a real usability failure:
 *
 *   `first-run` — the user has nothing because they are new. This is a good
 *   state. It should be encouraging and it must offer the action that fills it.
 *
 *   `no-results` — the user has things, but this filter or query matched none
 *   of them. This is a dead end. It should offer a way *out* (clear the
 *   filter), and it must never be phrased as "you have no transactions", which
 *   is both false and alarming when it is your own money being described.
 */
const EmptyState = ({
    variant = 'first-run',
    icon,
    title,
    description,
    action,
    secondaryAction,
    className,
}) => (
    <div className={cn('px-6 py-14 text-center', className)}>
        {icon && (
            <div
                aria-hidden="true"
                className={cn(
                    'mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full',
                    variant === 'first-run'
                        ? 'bg-accent-soft text-accent-text'
                        : 'bg-surface-sunken text-text-muted'
                )}
            >
                {icon}
            </div>
        )}

        <h3 className="text-base font-semibold text-text">{title}</h3>

        {description && (
            <p className="mx-auto mt-1.5 max-w-sm text-sm leading-6 text-text-muted">
                {description}
            </p>
        )}

        {(action || secondaryAction) && (
            <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
                {action}
                {secondaryAction}
            </div>
        )}
    </div>
);

export default EmptyState;
