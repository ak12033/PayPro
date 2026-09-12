import React, { useEffect, useRef } from 'react';
import cn from '../../lib/cn';
import Spinner from './Spinner';

/** Max pull distance and the radius it's computed within, both in px. */
const MAGNET_MAX_OFFSET = 8;
const MAGNET_RADIUS = 64;

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
    /* Press feedback (`scale`) lives in the `.btn-magnetic` utility instead of
       here — see Button's magnetic-hover effect below. An `active:scale-[]`
       class here would fight the inline transform that effect writes,
       because an inline style always wins over a class. */
    primary: 'bg-gradient-brand text-on-accent shadow-glow-accent hover:brightness-110 active:brightness-95',
    /**
     * Equal-weight alternatives, and the default for most actions.
     *
     * Neutral at rest, accent-tinted on the hairline once the pointer is on
     * it: enough to tie it to the primary without competing with it.
     */
    secondary:
        'bg-surface text-text border border-border hover:border-accent-border hover:bg-surface-hover active:bg-surface-active',
    /**
     * Low-emphasis, sits inline with content. Also the default for every bare
     * IconButton, which is why its hover is worth branding — it is the most
     * frequently hovered surface in the chrome.
     */
    ghost:
        'text-text-secondary hover:bg-accent-soft hover:text-accent-text active:bg-accent-soft active:text-accent-active',
    /** Destructive and irreversible. Never the default focus target. */
    danger: 'bg-danger text-on-danger hover:opacity-90 active:opacity-95 shadow-raised',
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
        /** Bounded pull-toward-cursor. Default on for `primary`; other variants
            never get it — magnetic pull is reserved for the one action a
            screen actually wants you to take. */
        magnetic = true,
        icon = null,
        iconEnd = null,
        className,
        children,
        type = 'button',
        ...rest
    },
    ref
) {
    const innerRef = useRef(null);
    const setRefs = (node) => {
        innerRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
    };

    const isMagnetic = variant === 'primary' && magnetic;

    useEffect(() => {
        if (!isMagnetic || disabled || loading) return undefined;
        const el = innerRef.current;
        if (!el) return undefined;

        const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!canHover || reduceMotion) return undefined;

        // Attached only while the cursor is inside the button, never a
        // page-wide listener — 14 primary buttons across the app each
        // holding a permanent `pointermove` subscription would be wasteful
        // for something that only ever matters while hovered.
        const handleMove = (event) => {
            const rect = el.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const dx = event.clientX - cx;
            const dy = event.clientY - cy;
            const dist = Math.hypot(dx, dy);
            const clamped = Math.min(dist, MAGNET_RADIUS);
            const scale = dist === 0 ? 0 : (clamped / dist) * (MAGNET_MAX_OFFSET / MAGNET_RADIUS);
            el.style.setProperty('--magnet-x', `${dx * scale}px`);
            el.style.setProperty('--magnet-y', `${dy * scale}px`);
        };
        const handleLeave = () => {
            el.removeEventListener('pointermove', handleMove);
            el.style.removeProperty('--magnet-x');
            el.style.removeProperty('--magnet-y');
        };
        const handleEnter = () => el.addEventListener('pointermove', handleMove);

        el.addEventListener('pointerenter', handleEnter);
        el.addEventListener('pointerleave', handleLeave);

        return () => {
            el.removeEventListener('pointerenter', handleEnter);
            el.removeEventListener('pointerleave', handleLeave);
            el.removeEventListener('pointermove', handleMove);
        };
    }, [isMagnetic, disabled, loading]);

    return (
        <button
            ref={setRefs}
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
                'transition-[background-color,color,opacity,box-shadow,filter,transform]',
                'duration-[--duration-fast] ease-[--ease-out]',
                'disabled:pointer-events-none disabled:opacity-45',
                VARIANTS[variant],
                SIZES[size],
                isMagnetic && 'btn-magnetic',
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
