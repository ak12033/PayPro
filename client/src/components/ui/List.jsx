import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import cn from '../../lib/cn';

/**
 * Rows.
 *
 * Almost every screen in a finance app is a list of things: transactions,
 * devices, settings, recipients, notifications. Those were five separately
 * written row layouts before, with five different heights, five different
 * hover treatments, and five different ideas about whether the whole row was
 * clickable or just the chevron at the end.
 *
 * One row component, three shapes of content, and a single rule about
 * interactivity: if the row does something, the whole row is the target.
 */

export const List = ({ children, className, ...rest }) => (
    <ul className={cn('divide-y divide-border', className)} {...rest}>
        {children}
    </ul>
);

/**
 * A row.
 *
 * Renders as <button>, <a> or plain <div> depending on what it does — never a
 * <div onClick>. That is what gives it keyboard operability, a focus ring and
 * the right screen-reader role for free.
 */
export const ListRow = ({
    leading,
    title,
    subtitle,
    meta,
    trailing,
    to,
    onClick,
    /** Suppresses the chevron on rows that open a sheet rather than navigate. */
    showChevron,
    className,
    children,
}) => {
    const interactive = Boolean(to || onClick);
    const chevron = showChevron ?? Boolean(to);

    const content = (
        <>
            {leading && <span className="shrink-0">{leading}</span>}

            <span className="min-w-0 flex-1 text-left">
                <span className="flex items-baseline gap-2">
                    <span className="truncate text-sm font-medium text-text">{title}</span>
                </span>
                {subtitle && (
                    <span className="mt-0.5 block truncate text-xs text-text-muted">{subtitle}</span>
                )}
                {children}
            </span>

            {(trailing || meta) && (
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                    {trailing}
                    {meta && <span className="text-xs text-text-muted">{meta}</span>}
                </span>
            )}

            {chevron && (
                <ChevronRight size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
            )}
        </>
    );

    const classes = cn(
        'flex w-full items-center gap-3 px-3 py-3 sm:px-4',
        // 56px minimum: comfortably above the 44px touch target, and tall
        // enough for two lines of text without the row growing.
        'min-h-14',
        interactive &&
            'transition-colors duration-[--duration-fast] hover:bg-surface-hover active:bg-surface-active',
        className
    );

    if (to) {
        return (
            <li>
                <Link to={to} className={classes}>
                    {content}
                </Link>
            </li>
        );
    }

    if (onClick) {
        return (
            <li>
                <button type="button" onClick={onClick} className={classes}>
                    {content}
                </button>
            </li>
        );
    }

    return <li className={classes}>{content}</li>;
};

/**
 * Sticky group heading inside a scrolling list.
 *
 * Transactions are grouped by day, and a date header that scrolls away leaves
 * the user looking at a column of amounts with no idea when they happened.
 */
export const ListGroupHeader = ({ children, right }) => (
    <li className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-canvas/95 px-3 py-2 backdrop-blur-sm sm:px-4">
        <span className="text-xs font-medium uppercase tracking-wide text-text-muted">
            {children}
        </span>
        {right && <span className="text-xs text-text-muted">{right}</span>}
    </li>
);

/** `label ....... value` — the shape of every receipt and detail panel. */
export const DetailRow = ({ label, value, tone }) => (
    <div className="flex items-start justify-between gap-4 py-2.5">
        <dt className="text-sm text-text-muted">{label}</dt>
        <dd className={cn('text-right text-sm font-medium text-text', tone)}>{value}</dd>
    </div>
);

export default List;
