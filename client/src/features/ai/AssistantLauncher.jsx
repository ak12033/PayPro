import React from 'react';
import LogoMark from '../../components/ui/LogoMark';
import { useAssistant } from '../../context/useAssistant';
import { APP_NAME } from '../../constants/app';

// Warms the sheet's lazy chunk on intent, so the first click opens it without
// waiting on a download. Same specifier as AssistantContext's `lazy()`.
const warmSheet = () => {
    import('./AssistantSheet').catch(() => {});
};

/**
 * The floating "Chat with PayPro" pill, bottom-right on every signed-in page.
 *
 * Opens the shell's assistant (AssistantContext) with no preset prompt. It
 * steps aside while the assistant is open, and renders nothing outside the
 * shell, where there is no assistant to open.
 *
 * Below `lg` the tab bar is fixed along the bottom edge, so the pill sits
 * above it there; on the narrowest phones the label collapses to the mark
 * alone (still announced to assistive tech) so it does not cover content.
 */
const AssistantLauncher = () => {
    const { openAssistant, available, isOpen } = useAssistant();
    if (!available || isOpen) return null;

    const label = `Chat with ${APP_NAME}`;

    return (
        <button
            type="button"
            onClick={() => openAssistant()}
            onPointerEnter={warmSheet}
            onFocus={warmSheet}
            aria-label={label}
            title={label}
            className={[
                'group fixed right-4 z-40 inline-flex items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-4',
                'bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-6 lg:right-6',
                'border border-border bg-surface/95 shadow-overlay backdrop-blur',
                'transition-[scale,border-color,box-shadow] duration-(--duration-hover) ease-(--ease-out)',
                'motion-safe:hover:scale-[1.04] hover:border-accent-border hover:shadow-lift-card',
                'max-[479px]:pr-1.5',
            ].join(' ')}
        >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft">
                <LogoMark size={22} />
            </span>
            <span className="whitespace-nowrap text-[13px] font-semibold text-text-secondary transition-colors duration-(--duration-hover) group-hover:text-accent-text max-[479px]:sr-only">
                {label}
            </span>
        </button>
    );
};

export default AssistantLauncher;
