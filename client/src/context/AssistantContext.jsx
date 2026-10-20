import React, { Suspense, lazy, useCallback, useMemo, useState } from 'react';
import { AssistantContext } from './useAssistant';

const AssistantSheet = lazy(() => import('../features/ai/AssistantSheet'));

/**
 * One assistant for the whole shell, opened from wherever the user has a
 * question (plan.md §25.1): Insights, Help, a failed top-up, a transaction,
 * a rejected withdrawal.
 *
 * Contextual entry points, plus one always-visible launcher in the shell
 * (AssistantLauncher). Nothing is fetched or even downloaded until the first
 * `openAssistant()`: the sheet's code is a lazy chunk mounted on first use,
 * which keeps the reason the old always-mounted panel was removed (a history
 * request on every page load) from coming back. The launcher is only a
 * button, so it costs nothing until it is clicked.
 *
 * `isOpen` lets that launcher step aside while the sheet is up.
 */
export const AssistantProvider = ({ children }) => {
    const [mounted, setMounted] = useState(false);
    const [open, setOpen] = useState(false);
    const [request, setRequest] = useState({ prompt: null, resource: null });

    const openAssistant = useCallback(({ prompt = null, resource = null } = {}) => {
        setRequest({ prompt, resource });
        setMounted(true);
        setOpen(true);
    }, []);

    const close = useCallback(() => setOpen(false), []);

    const value = useMemo(() => ({ openAssistant, available: true, isOpen: open }), [openAssistant, open]);

    return (
        <AssistantContext.Provider value={value}>
            {children}
            {mounted && (
                <Suspense fallback={null}>
                    <AssistantSheet
                        open={open}
                        onClose={close}
                        initialPrompt={request.prompt}
                        initialResource={request.resource}
                    />
                </Suspense>
            )}
        </AssistantContext.Provider>
    );
};

export default AssistantProvider;
