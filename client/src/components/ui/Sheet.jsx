import React, { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import cn from '../../lib/cn';
import { IconButton } from './Button';

const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Modal surface — a bottom sheet on mobile, a centred dialog on desktop.
 *
 * One component for both because they are the same *thing*: an interruption
 * that owns the screen until it is resolved. Splitting them produces two
 * implementations that drift, which is how the old notification dropdown ended
 * up dismissible by Escape while the account menu was not.
 *
 * What this does that the previous ad-hoc dropdowns did not:
 *
 *   - renders in a portal, so it cannot be clipped by an ancestor's `overflow`
 *     or trapped beneath a sibling's stacking context;
 *   - traps Tab inside itself, so a keyboard user cannot wander into the page
 *     behind an open dialog and operate controls they cannot see;
 *   - returns focus to whatever opened it on close;
 *   - locks body scroll, so the page behind does not scroll under the sheet.
 */
const Sheet = ({
    open,
    onClose,
    title,
    description,
    /** Sheets that must be resolved (a payment result) opt out of casual dismissal. */
    dismissible = true,
    size = 'md',
    footer,
    children,
    className,
}) => {
    const panelRef = useRef(null);
    const restoreFocusRef = useRef(null);

    const handleKeyDown = useCallback(
        (event) => {
            if (event.key === 'Escape' && dismissible) {
                event.stopPropagation();
                onClose?.();
                return;
            }

            if (event.key !== 'Tab' || !panelRef.current) return;

            const focusable = Array.from(panelRef.current.querySelectorAll(FOCUSABLE));
            if (focusable.length === 0) {
                event.preventDefault();
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            // Wrap in both directions; without the Shift branch, Shift+Tab from
            // the first control escapes the dialog into the page behind it.
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        },
        [dismissible, onClose]
    );

    useEffect(() => {
        if (!open) return undefined;

        restoreFocusRef.current = document.activeElement;

        const { overflow, paddingRight } = document.body.style;
        // Compensate for the removed scrollbar so the page behind does not
        // visibly shift sideways as the sheet opens.
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        document.body.style.overflow = 'hidden';
        if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;

        // Focus the panel itself rather than its first control: landing on
        // "Cancel" makes the screen reader announce the escape hatch before the
        // question being asked.
        const frame = requestAnimationFrame(() => panelRef.current?.focus());

        return () => {
            cancelAnimationFrame(frame);
            document.body.style.overflow = overflow;
            document.body.style.paddingRight = paddingRight;
            restoreFocusRef.current?.focus?.();
        };
    }, [open]);

    if (!open) return null;

    const width = {
        sm: 'sm:max-w-sm',
        md: 'sm:max-w-md',
        lg: 'sm:max-w-lg',
        xl: 'sm:max-w-2xl',
    }[size];

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
            onKeyDown={handleKeyDown}
        >
            <div
                className="absolute inset-0 bg-scrim backdrop-blur-sm animate-fade-in"
                onClick={dismissible ? onClose : undefined}
                aria-hidden="true"
            />

            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                tabIndex={-1}
                className={cn(
                    'relative flex w-full flex-col bg-surface-glass backdrop-blur-xl border border-border-glass shadow-overlay outline-none',
                    // Rounded top only on mobile, where it reads as a sheet
                    // rising from the bottom edge.
                    'max-h-[92dvh] rounded-t-panel sm:max-h-[85dvh] sm:rounded-panel',
                    'animate-sheet-up sm:animate-pop',
                    width,
                    className
                )}
            >
                {/* Drag affordance. Purely a mobile signifier — it tells the
                    user the surface is dismissible before they try. */}
                {dismissible && (
                    <div className="mx-auto mt-3 h-1 w-9 shrink-0 rounded-pill bg-border-strong sm:hidden" />
                )}

                {(title || dismissible) && (
                    <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
                        <div className="min-w-0">
                            {title && (
                                <h2 className="text-lg font-semibold text-text">{title}</h2>
                            )}
                            {description && (
                                <p className="mt-1 text-sm text-text-muted">{description}</p>
                            )}
                        </div>
                        {dismissible && (
                            <IconButton label="Close" size="sm" onClick={onClose} className="-mr-1 -mt-1">
                                <X size={18} />
                            </IconButton>
                        )}
                    </div>
                )}

                <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>

                {footer && (
                    <div className="shrink-0 border-t border-border px-5 py-4 pb-safe sm:pb-4">
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};

/**
 * Yes/no confirmation.
 *
 * Built on Sheet so that confirming a transfer and confirming a device
 * sign-out are structurally the same interaction. The destructive action is
 * never the autofocused control.
 */
export const ConfirmSheet = ({
    open,
    onClose,
    onConfirm,
    title,
    description,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'primary',
    loading = false,
    /** Extra content between the description and the footer — e.g. a
        re-authentication field for a destructive account action. Most
        confirmations need none, which is why the description alone still
        renders (visibly, once there's a body to sit above) when omitted. */
    children,
}) => (
    <Sheet
        open={open}
        onClose={onClose}
        title={title}
        description={description}
        size="sm"
        dismissible={!loading}
        footer={
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                    type="button"
                    onClick={onClose}
                    disabled={loading}
                    className="h-11 rounded-control px-4 text-sm font-medium text-text-secondary hover:bg-surface-hover disabled:opacity-45"
                >
                    {cancelLabel}
                </button>
                <ConfirmButton variant={variant} loading={loading} onClick={onConfirm}>
                    {confirmLabel}
                </ConfirmButton>
            </div>
        }
    >
        {children ?? <span className="sr-only">{description}</span>}
    </Sheet>
);

// Local import-free wrapper so ConfirmSheet does not create a circular import
// through Button -> Spinner -> Sheet.
const ConfirmButton = ({ variant, loading, onClick, children }) => {
    const tone =
        variant === 'danger'
            ? 'bg-danger text-on-danger shadow-raised hover:opacity-90'
            : 'bg-gradient-brand text-on-accent shadow-glow-accent hover:brightness-110';

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={loading}
            aria-busy={loading || undefined}
            className={cn(
                'h-11 rounded-control px-5 text-sm font-medium disabled:opacity-45',
                tone
            )}
        >
            {children}
        </button>
    );
};

export default Sheet;
