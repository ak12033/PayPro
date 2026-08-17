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
    /** No chrome at all; used to group without drawing a box. */
    bare: '',
};

const PADDING = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-5 sm:p-6',
};

const Card = React.forwardRef(function Card(
    { as: Tag = 'div', variant = 'plain', padding = 'lg', className, children, ...rest },
    ref
) {
    return (
        <Tag
            ref={ref}
            className={cn('rounded-card', VARIANTS[variant], PADDING[padding], className)}
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
