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
    /**
     * The one thing this screen is for. At most one per view.
     *
     * The brand gradient itself, and the only place in the product that gets
     * it at full strength — this is the button the palette was drawn from.
     */
    primary:
        'bg-gradient-brand text-on-accent shadow-glow-accent hover:shadow-glow-accent-hover hover:brightness-110 active:brightness-95',
    /**
     * Equal-weight alternatives, and the default for most actions.
     *
     * Neutral at rest, accent-tinted on the hairline once the pointer is on
     * it: enough to tie it to the primary without competing with it.
     */
    secondary:
        'bg-surface text-text border border-border hover:border-accent-border hover:bg-surface-hover hover:shadow-lift active:bg-surface-active',
    /**
     * Low-emphasis, sits inline with content. Also the default for every bare
     * IconButton, which is why its hover is worth branding — it is the most
     * frequently hovered surface in the chrome.
     *
     */
    ghost:
        'text-text-secondary hover:bg-accent-soft hover:text-accent-text active:bg-accent-soft active:text-accent-active',
    /** Destructive and irreversible. Never the default focus target. */
    danger: 'bg-danger text-on-danger shadow-raised hover:opacity-90 hover:shadow-lift active:opacity-95',
    /** AI-initiated actions, tinted so generated content is always labelled. */
    ai: 'bg-ai-soft text-ai border border-ai/20 hover:brightness-105 hover:shadow-lift',
};

/* Shared by Button and IconButton. On hover the button grows slightly in
   place (scale from its centre, so nothing around it reflows) alongside
   its colour and shadow change. `motion-safe` leaves it still for anyone
   who has asked for reduced motion.

   The amount depends on the shape, because scale is a percentage: 4% of a
   44px icon button is under 2px, but 4% of a full-width button is 15px or
   more and reads as the button stretching sideways. */
const MOTION =
    'transition-[background-color,border-color,color,opacity,box-shadow,filter,scale] duration-(--duration-hover) ease-(--ease-out)';
const GROW = {
    icon: 'motion-safe:hover:scale-[1.04]',
    inline: 'motion-safe:hover:scale-[1.02]',
    fullWidth: 'motion-safe:hover:scale-[1.01]',
};

/**
 * Heights, not paddings.
 *
 * Every size is at least 36px tall and the three used on touch surfaces clear
 * the 44px WCAG 2.5.5 target. Sizing by padding made that impossible to verify,
 * because the final height depended on the line-height of whatever was inside.
 */
const SIZES = {
    sm: 'h-9 px-2.5 text-sm gap-1.5',
    md: 'h-11 px-3 text-sm gap-2',
    lg: 'h-12 px-4 text-base gap-2',
    /** Reserved for the commit step of a money flow. */
    xl: 'h-14 px-5 text-base gap-2.5',
};

const Button = React.forwardRef(function Button(
    {
        variant = 'secondary',
        size = 'md',
        /**
         * `true` fills the container at every width: right inside sheets,
         * auth cards and the narrow money flows. `'mobile'` fills it only on
         * phones and sizes to the label from `sm` up, for buttons that sit on
         * a wide page surface, where a full-width bar reads as a banner
         * rather than a button.
         */
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
                'group relative inline-flex select-none items-center justify-center',
                'rounded-control font-medium whitespace-nowrap',
                MOTION,
                'disabled:pointer-events-none disabled:opacity-45',
                VARIANTS[variant],
                SIZES[size],
                fullWidth === 'mobile'
                    ? cn('w-full sm:w-auto sm:min-w-40', GROW.fullWidth, 'sm:motion-safe:hover:scale-[1.02]')
                    : fullWidth
                        ? cn('w-full', GROW.fullWidth)
                        : GROW.inline,
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
                MOTION,
                GROW.icon,
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
