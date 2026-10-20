import React from 'react';
import cn from '../../lib/cn';

/**
 * The container every panel is built from.
 *
 * The previous version was a stack of glass effects: 20px blur, a 60px shadow
 * and a translucent white fill on every single panel. Three problems with that
 * in a finance product — `backdrop-blur` on large surfaces is one of the most
 * expensive things a browser can be asked to do and it was applied to a dozen
 * elements per screen; translucency means the contrast of the text on top
 * depends on whatever happens to be behind it, so no contrast ratio can be
 * guaranteed; and when everything is elevated, nothing is.
 *
 * Elevation is now information: `raised` means "this floats above the page",
 * and only overlays get more than that.
 */
const VARIANTS = {
    /** Default. Sits on the canvas, separated by a border. */
    plain: 'bg-surface border border-border',
    /** Pulled forward — the balance card, an active confirmation. */
    raised: 'bg-surface border border-border shadow-raised',
    /** Pushed back — a well *inside* another card. */
    sunken: 'bg-surface-sunken border border-border',
    /**
     * Floating chrome — the balance card, auth forms, a hero panel. Reserved
     * for the one or two surfaces per screen that should read as "elevated
     * above everything else"; a dense list of these would cost every row a
     * `backdrop-filter` and erase the hierarchy the effect is meant to signal.
     */
    glass: 'bg-surface-glass border border-border-glass backdrop-blur-xl shadow-overlay',
    /** No chrome at all; used to group without drawing a box. */
    bare: '',
};

const PADDING = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-5 sm:p-6',
};

/**
 * Hover treatment for a card that is itself a target (wrapped in a link, or
 * opening a sheet). It grows slightly in place and picks up the accent
 * hairline and a soft shadow. Scaling from the centre never reflows the
 * cards around it, and `motion-safe` keeps it still for anyone who has
 * asked for reduced motion.
 *
 * `group` is set so content can react with the card. LinkCard uses it to tint
 * its title and arrow.
 */
const INTERACTIVE = cn(
    'group cursor-pointer',
    'transition-[scale,box-shadow,border-color,background-color] duration-(--duration-normal) ease-(--ease-out)',
    'motion-safe:hover:scale-[1.02] hover:border-accent-border hover:shadow-lift-card'
);

const Card = React.forwardRef(function Card(
    { as: Tag = 'div', variant = 'plain', padding = 'lg', interactive = false, className, children, ...rest },
    ref
) {
    return (
        <Tag
            ref={ref}
            className={cn('rounded-card', VARIANTS[variant], PADDING[padding], interactive && INTERACTIVE, className)}
            {...rest}
        >
            {children}
        </Tag>
    );
});

/**
 * Card header with a title, optional supporting line, and an action slot.
 *
 * `as` exists so the heading level can match the document outline. Six screens
 * previously opened with an <h2> nested under nothing, which leaves a screen
 * reader's heading list with holes in it.
 */
export const CardHeader = ({ title, description, action, as: Heading = 'h2', className }) => (
    <div className={cn('flex items-start justify-between gap-3', className)}>
        <div className="min-w-0">
            <Heading className="text-base font-semibold text-text">{title}</Heading>
            {description && (
                <p className="mt-1 text-sm text-text-muted">{description}</p>
            )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
    </div>
);

export default Card;
