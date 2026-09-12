import React, { useRef } from 'react';
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
            role="tablist"
            aria-label={label}
            className={cn(
                'inline-flex gap-1 rounded-control bg-surface-sunken p-1',
                // Scrolls rather than wraps on narrow screens: a filter row that
                // reflows to two lines pushes the content below it out of view.
                'max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                className
            )}
        >
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
                            'shrink-0 rounded-[calc(var(--radius-control)-2px)] px-3 font-medium',
                            'transition-colors duration-[--duration-fast] ease-[--ease-out]',
                            height,
                            // The raised surface is what marks the selection;
                            // the accent text is what ties it to the rest of
                            // the product. Both, rather than colour alone —
                            // `aria-selected` and the elevation still carry it
                            // for anyone who cannot see the hue.
                            selected
                                ? 'bg-surface text-accent-text shadow-raised'
                                : 'text-text-muted hover:text-text'
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
