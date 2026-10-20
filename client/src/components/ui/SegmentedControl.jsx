import React, { useLayoutEffect, useRef, useState } from 'react';
import cn from '../../lib/cn';

/**
 * Mutually-exclusive choice across a small set of options.
 *
 * Implemented as an ARIA tablist with roving tabindex, so arrow keys move
 * between options and only one segment is in the tab order. The old filter
 * chips were a row of plain <button>s: a keyboard user had to Tab through all
 * six filters to reach the transaction list beneath them, on every page load.
 *
 * The selected segment is marked by a filled surface *and* `aria-selected`,
 * never by colour alone.
 */
const SegmentedControl = ({
    options,
    value,
    onChange,
    size = 'md',
    label = 'Filter',
    className,
}) => {
    const refs = useRef([]);
    const listRef = useRef(null);
    /**
     * One raised pill that slides between options, rather than the old
     * surface jumping from one segment to the next. Measured, not computed
     * from an index, because segments are as wide as their labels.
     * `null` until measured, and then each segment falls back to painting its
     * own surface, so nothing is ever unmarked (jsdom, a failed measure).
     */
    const [indicator, setIndicator] = useState(null);
    const selectedIndex = options.findIndex((option) => option.value === value);

    useLayoutEffect(() => {
        const list = listRef.current;
        const node = refs.current[selectedIndex];
        if (!list || !node) {
            setIndicator(null);
            return undefined;
        }

        const measure = () => {
            if (!node.offsetWidth) return setIndicator(null);
            setIndicator({ left: node.offsetLeft, width: node.offsetWidth });
            return undefined;
        };
        measure();

        // A label that changes width (a count arriving) or a container that
        // reflows must carry the pill with it.
        if (typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(measure);
        observer.observe(list);
        observer.observe(node);
        return () => observer.disconnect();
    }, [selectedIndex, options.length]);

    const handleKeyDown = (event, index) => {
        const last = options.length - 1;
        let next = null;

        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = index === last ? 0 : index + 1;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = index === 0 ? last : index - 1;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = last;

        if (next === null) return;

        event.preventDefault();
        onChange(options[next].value);
        refs.current[next]?.focus();
    };

    const height = size === 'sm' ? 'h-8 text-xs' : 'h-9 text-sm';

    return (
        <div
            ref={listRef}
            role="tablist"
            aria-label={label}
            className={cn(
                'relative inline-flex gap-1 rounded-control bg-surface-sunken p-1',
                // Scrolls rather than wraps on narrow screens: a filter row that
                // reflows to two lines pushes the content below it out of view.
                'max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                className
            )}
        >
            {indicator && (
                <span
                    aria-hidden="true"
                    className={cn(
                        'pointer-events-none absolute left-0 top-1 bottom-1 rounded-[calc(var(--radius-control)-2px)] bg-surface shadow-raised',
                        'transition-[translate,width] duration-(--duration-normal) ease-(--ease-out)'
                    )}
                    style={{ width: indicator.width, translate: `${indicator.left}px 0` }}
                />
            )}
            {options.map((option, index) => {
                const selected = option.value === value;

                return (
                    <button
                        key={option.value}
                        ref={(node) => { refs.current[index] = node; }}
                        role="tab"
                        type="button"
                        aria-selected={selected}
                        tabIndex={selected ? 0 : -1}
                        onClick={() => onChange(option.value)}
                        onKeyDown={(event) => handleKeyDown(event, index)}
                        className={cn(
                            // `relative` lifts the label above the sliding pill.
                            'relative shrink-0 rounded-[calc(var(--radius-control)-2px)] px-3 font-medium',
                            'transition-[color,background-color,scale] duration-(--duration-fast) ease-(--ease-out)',
                            height,
                            // The raised surface is what marks the selection;
                            // the accent text is what ties it to the rest of
                            // the product. Both, rather than colour alone —
                            // `aria-selected` and the elevation still carry it
                            // for anyone who cannot see the hue.
                            selected
                                ? cn('text-accent-text', !indicator && 'bg-surface shadow-raised')
                                : 'text-text-muted hover:bg-surface/50 hover:text-text'
                        )}
                    >
                        {option.label}
                        {option.count !== undefined && (
                            <span className="ml-1.5 text-text-muted tabular-nums">{option.count}</span>
                        )}
                    </button>
                );
            })}
        </div>
    );
};

export default SegmentedControl;
