import React, { useEffect, useRef } from 'react';
import { digitsOnly } from '../../utils/validation';
import cn from '../../lib/cn';

const OTP_LENGTH = 6;

/**
 * One-time code entry.
 *
 * A single input rendered to *look* like six boxes, rather than six actual
 * inputs. Six real inputs is the more common implementation and it is the wrong
 * one: it breaks paste, it breaks iOS SMS autofill, backspace behaviour across
 * the boxes is never quite right, and a screen reader announces six unlabelled
 * fields where the user expects one code.
 *
 * With one input, `autoComplete="one-time-code"` works, paste works, and the
 * boxes are purely presentational.
 */
const OtpField = ({
    value,
    onChange,
    onSubmit,
    label = 'Verification code',
    error,
    autoFocus = true,
    disabled = false,
}) => {
    const inputRef = useRef(null);

    useEffect(() => {
        if (autoFocus) inputRef.current?.focus();
    }, [autoFocus]);

    // Submit as soon as the code is complete. Asking someone to type six digits
    // and then find a button is a step that carries no information — there is
    // nothing else they could mean by a complete code.
    useEffect(() => {
        if (value.length === OTP_LENGTH) onSubmit?.();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const digits = value.padEnd(OTP_LENGTH, ' ').split('');

    return (
        <div className="space-y-2">
            <label htmlFor="otp" className="block text-sm font-medium text-text">
                {label}
            </label>

            <div className="relative">
                <input
                    ref={inputRef}
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    maxLength={OTP_LENGTH}
                    autoComplete="one-time-code"
                    disabled={disabled}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? 'otp-error' : undefined}
                    value={value}
                    onChange={(event) => onChange(digitsOnly(event.target.value))}
                    // Transparent and stretched over the boxes: the real input
                    // still owns focus, caret and selection, so every native
                    // behaviour is intact.
                    className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
                />

                <div aria-hidden="true" className="flex gap-2">
                    {digits.map((digit, index) => {
                        const filled = digit !== ' ';
                        const active = index === value.length && !disabled;

                        return (
                            <div
                                key={index}
                                className={cn(
                                    'flex h-14 flex-1 items-center justify-center rounded-control border text-xl font-semibold',
                                    'transition-[color,background-color,border-color,box-shadow] duration-(--duration-fast)',
                                    error
                                        ? 'border-danger bg-danger-soft text-danger'
                                        : active
                                          ? 'border-accent bg-surface text-text shadow-[0_0_0_3px_var(--color-accent-soft)]'
                                          : filled
                                            ? 'border-border-strong bg-surface text-text'
                                            : 'border-border bg-surface-sunken text-text-muted'
                                )}
                            >
                                {filled ? digit : ''}
                            </div>
                        );
                    })}
                </div>
            </div>

            {error && (
                <p id="otp-error" role="alert" className="text-xs text-danger">
                    {error}
                </p>
            )}
        </div>
    );
};

export default OtpField;
