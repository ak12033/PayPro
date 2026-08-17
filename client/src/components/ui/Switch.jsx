import React, { useId } from 'react';
import cn from '../../lib/cn';
import Spinner from './Spinner';

/**
 * Toggle for a setting that applies immediately.
 *
 * Built on a real checkbox rather than a styled <div role="switch">, so it
 * participates in forms, responds to Space, and is announced with its state
 * without any extra ARIA wiring.
 *
 * `pending` matters here more than it usually would: several of these toggles
 * control security behaviour (transaction 2FA), and the write is a network
 * round-trip. Flipping instantly and silently reverting on failure would tell
 * the user they had disabled a protection that is in fact still on — or worse,
 * that they had enabled one that is not.
 */
const Switch = ({
    checked,
    onChange,
    label,
    description,
    pending = false,
    disabled = false,
    className,
}) => {
    const id = useId();
    const descriptionId = description ? `${id}-description` : undefined;

    return (
        <div className={cn('flex items-start justify-between gap-4 py-3', className)}>
            <div className="min-w-0">
                <label htmlFor={id} className="block text-sm font-medium text-text">
                    {label}
                </label>
                {description && (
                    <p id={descriptionId} className="mt-0.5 text-xs leading-5 text-text-muted">
                        {description}
                    </p>
                )}
            </div>

            <span className="relative inline-flex shrink-0 items-center">
                <input
                    id={id}
                    type="checkbox"
                    role="switch"
                    checked={checked}
                    disabled={disabled || pending}
                    aria-describedby={descriptionId}
                    onChange={(event) => onChange(event.target.checked)}
                    // Visually hidden but still the real hit target, so the
                    // toggle is operable by pointer, keyboard and screen reader
                    // with no synthetic event handling.
                    className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                />
                <span
                    aria-hidden="true"
                    className={cn(
                        'flex h-6 w-11 items-center rounded-pill p-0.5',
                        'transition-colors duration-[--duration-fast] ease-[--ease-out]',
                        'peer-focus-visible:outline peer-focus-visible:outline-2',
                        'peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
                        'peer-disabled:opacity-50',
                        checked ? 'bg-accent' : 'bg-border-strong'
                    )}
                >
                    <span
                        className={cn(
                            'grid h-5 w-5 place-items-center rounded-full bg-white shadow-raised',
                            'transition-transform duration-[--duration-fast] ease-[--ease-out]',
                            checked && 'translate-x-5'
                        )}
                    >
                        {pending && <Spinner size="sm" className="h-3 w-3 text-accent" tone="current" />}
                    </span>
                </span>
            </span>
        </div>
    );
};

export default Switch;
