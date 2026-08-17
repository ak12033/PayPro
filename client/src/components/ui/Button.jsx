import React from 'react';
import cn from '../../lib/cn';
import Spinner from './Spinner';

/**
 * The button.
 *
 * Five intents, and that is the complete list. The previous set was built the
 * other way round — a `success` variant existed because one screen wanted a
 * green button, which meant colour was carrying meaning the label should have
 * carried. Intent here describes *what the action does*, so the visual
 * treatment can change globally without re-auditing call sites.
 */
const VARIANTS = {
    /** The one thing this screen is for. At most one per view. */
    primary:
        'bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-hover shadow-raised',
    /** Equal-weight alternatives, and the default for most actions. */
    secondary:
        'bg-surface text-text border border-border hover:bg-surface-hover active:bg-surface-active',
    /** Low-emphasis, sits inline with content. */
    ghost:
        'text-text-secondary hover:bg-surface-hover hover:text-text active:bg-surface-active',
    /** Destructive and irreversible. Never the default focus target. */
    danger: 'bg-danger text-white hover:opacity-90 active:opacity-95 shadow-raised',
    /** AI-initiated actions, tinted so generated content is always labelled. */
    ai: 'bg-ai-soft text-ai border border-ai/20 hover:brightness-105',
};

/**
 * Heights, not paddings.
 *
 * Every size is at least 36px tall and the three used on touch surfaces clear
 * the 44px WCAG 2.5.5 target. Sizing by padding made that impossible to verify,
 * because the final height depended on the line-height of whatever was inside.
 */
const SIZES = {
    sm: 'h-9 px-3 text-sm gap-1.5',
    md: 'h-11 px-4 text-sm gap-2',
    lg: 'h-12 px-5 text-base gap-2',
    /** Reserved for the commit step of a money flow. */
    xl: 'h-14 px-6 text-base gap-2.5',
};

const Button = React.forwardRef(function Button(
    {
        variant = 'secondary',
        size = 'md',
        fullWidth = false,
        loading = false,
        disabled = false,
        icon = null,
        iconEnd = null,
        className,
        children,
        type = 'button',
        ...rest
    },
    ref
) {
    return (
        <button
            ref={ref}
            type={type}
            disabled={disabled || loading}
            /**
             * `aria-busy` rather than swapping the label for a spinner: a screen
             * reader user who has already heard "Send ₹500" should not have the
             * button silently rename itself to "Loading" mid-action.
             */
            aria-busy={loading || undefined}
            className={cn(
                'relative inline-flex select-none items-center justify-center',
                'rounded-control font-medium whitespace-nowrap',
                'transition-[background-color,color,opacity,box-shadow]',
                'duration-[--duration-fast] ease-[--ease-out]',
                'disabled:pointer-events-none disabled:opacity-45',
                VARIANTS[variant],
                SIZES[size],
                fullWidth && 'w-full',
                className
            )}
            {...rest}
        >
            {/* The label stays in the layout while loading so the button does
                not change width — a resizing button under the user's cursor is
                how mis-clicks happen on a payment screen. */}
            <span className={cn('inline-flex items-center gap-[inherit]', loading && 'invisible')}>
                {icon}
                {children}
                {iconEnd}
            </span>

            {loading && (
                <span className="absolute inset-0 grid place-items-center">
                    <Spinner size="sm" tone="current" />
                </span>
            )}
        </button>
    );
});

/**
 * Square button for a bare icon.
 *
 * Separate from Button because it has a requirement Button does not: it cannot
 * be rendered without an accessible name, so the prop is mandatory rather than
 * optional-and-usually-forgotten.
 */
export const IconButton = React.forwardRef(function IconButton(
    { label, variant = 'ghost', size = 'md', className, children, ...rest },
    ref
) {
    const box = { sm: 'h-9 w-9', md: 'h-11 w-11', lg: 'h-12 w-12' }[size];

    return (
        <button
            ref={ref}
            type="button"
            aria-label={label}
            title={label}
            className={cn(
                'inline-grid place-items-center rounded-control',
                'transition-colors duration-[--duration-fast] ease-[--ease-out]',
                'disabled:pointer-events-none disabled:opacity-45',
                VARIANTS[variant],
                box,
                className
            )}
            {...rest}
        >
            {children}
        </button>
    );
});

export default Button;
