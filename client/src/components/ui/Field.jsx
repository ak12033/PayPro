import React, { useId } from 'react';
import cn from '../../lib/cn';

/**
 * Form control wrapper.
 *
 * Everything here exists because of one rule: an input must be reachable,
 * labelled, and — when it is wrong — must *say what is wrong* in a way both a
 * sighted user and a screen reader receive.
 *
 * The previous fields failed all three. Labels were sibling <p> tags with no
 * `htmlFor`, so tapping the label did nothing and a screen reader announced
 * "edit text, blank". Errors were rendered as loose red text with no
 * `aria-describedby`, so they were never announced at all — a user filling in a
 * transfer amount by keyboard had no way to learn why the form would not
 * submit.
 */
export const Field = ({
    label,
    hint,
    error,
    required = false,
    /** Render prop: receives the ids/props the control must spread onto itself. */
    children,
    className,
}) => {
    const id = useId();
    const hintId = `${id}-hint`;
    const errorId = `${id}-error`;

    const describedBy =
        [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;

    return (
        <div className={cn('space-y-1.5', className)}>
            {label && (
                <label htmlFor={id} className="block text-sm font-medium text-text">
                    {label}
                    {/* The asterisk is decorative; `required` on the control is
                        what actually conveys this to assistive tech. */}
                    {required && (
                        <span className="ml-0.5 text-danger" aria-hidden="true">
                            *
                        </span>
                    )}
                </label>
            )}

            {children({
                id,
                'aria-describedby': describedBy,
                'aria-invalid': error ? true : undefined,
                required,
            })}

            {/* Hint is suppressed while an error is showing: two competing
                explanations under one field is worse than one clear one. */}
            {hint && !error && (
                <p id={hintId} className="text-xs text-text-muted">
                    {hint}
                </p>
            )}

            {error && (
                /* `role="alert"` so the message is announced the moment it
                   appears, rather than only if the user happens to navigate
                   back onto the field. */
                <p id={errorId} role="alert" className="flex items-start gap-1 text-xs text-danger">
                    {error}
                </p>
            )}
        </div>
    );
};

const CONTROL_BASE = cn(
    'w-full rounded-control border bg-surface text-text',
    'placeholder:text-text-muted',
    'transition-[border-color,box-shadow] duration-[--duration-fast]',
    'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-text-muted',
    // aria-invalid drives the error styling, so the visual state and the
    // accessible state cannot drift apart.
    'border-border aria-[invalid=true]:border-danger',
    // The bare control had no focused appearance of its own — it relied
    // entirely on the global `:focus-visible` outline, so a *pointer* user
    // clicking into it saw the field not react at all, while the prefixed
    // variant below did tint. Same accent border on both now, and it yields
    // to the danger border when the field is invalid.
    //
    // Border only: the outline is the global one from index.css, and
    // `focus:outline-none` here is exactly the mistake that comment warns
    // about.
    'focus:border-accent aria-[invalid=true]:focus:border-danger'
);

/** Single-line text input. */
export const Input = React.forwardRef(function Input(
    { size = 'md', prefix, suffix, className, ...rest },
    ref
) {
    const height = size === 'lg' ? 'h-12 text-base' : 'h-11 text-sm';

    if (!prefix && !suffix) {
        return <input ref={ref} className={cn(CONTROL_BASE, height, 'px-3', className)} {...rest} />;
    }

    return (
        <div
            className={cn(
                'flex items-center rounded-control border border-border bg-surface',
                'focus-within:border-accent',
                height,
                className
            )}
        >
            {prefix && (
                <span className="pl-3 text-sm text-text-muted" aria-hidden="true">
                    {prefix}
                </span>
            )}
            <input
                ref={ref}
                className="min-w-0 flex-1 bg-transparent px-3 text-inherit outline-none placeholder:text-text-muted"
                {...rest}
            />
            {suffix && <span className="pr-3 text-sm text-text-muted">{suffix}</span>}
        </div>
    );
});

/**
 * The amount input.
 *
 * A dedicated component because entering a sum of money has requirements a
 * generic text field does not:
 *
 *   - `inputMode="decimal"` brings up the numeric keypad on mobile. The old
 *     field used `type="number"`, which on iOS shows the *telephone* keypad,
 *     and on desktop attaches a scroll-wheel handler — so scrolling the page
 *     with the cursor over the field silently changed the amount being sent.
 *   - The value is echoed back large and formatted, so the user reads what they
 *     are about to send rather than what they typed.
 */
export const AmountInput = React.forwardRef(function AmountInput(
    { value, onChange, currency = '₹', className, ...rest },
    ref
) {
    const handleChange = (event) => {
        const next = event.target.value;
        // Digits and at most one decimal point, at most two decimal places.
        if (next === '' || /^\d*\.?\d{0,2}$/.test(next)) {
            onChange(next);
        }
        // Anything else is dropped rather than flagged: silently refusing a
        // stray letter is less disruptive than an error message that appears
        // and vanishes as the user types.
    };

    return (
        <div
            className={cn(
                'flex items-center gap-1 rounded-card border border-border bg-surface px-4 py-4',
                'focus-within:border-accent focus-within:shadow-raised',
                'transition-[border-color,box-shadow] duration-[--duration-fast]',
                className
            )}
        >
            <span className="text-2xl font-semibold text-text-muted" aria-hidden="true">
                {currency}
            </span>
            <input
                ref={ref}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={value}
                onChange={handleChange}
                placeholder="0"
                className={cn(
                    'min-w-0 flex-1 bg-transparent text-3xl font-semibold tabular-nums',
                    'text-text outline-none placeholder:text-text-muted'
                )}
                {...rest}
            />
        </div>
    );
});

/** Select, styled to match Input rather than inheriting the OS control. */
export const Select = React.forwardRef(function Select({ className, children, ...rest }, ref) {
    return (
        <select
            ref={ref}
            className={cn(CONTROL_BASE, 'h-11 px-3 text-sm', className)}
            {...rest}
        >
            {children}
        </select>
    );
});

export default Field;
