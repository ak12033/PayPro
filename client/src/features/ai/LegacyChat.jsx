import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Send, Trash2 } from 'lucide-react';
import LogoMark from '../../components/ui/LogoMark';
import Sheet, { ConfirmSheet } from '../../components/ui/Sheet';
import { IconButton } from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import { Input } from '../../components/ui/Field';
import { aiApi } from '../../services/api/endpoints/aiApi';
import { getErrorMessage } from '../../utils/errors';
import cn from '../../lib/cn';

const SUGGESTIONS = [
    'How much did I spend last month?',
    'What was my largest transaction?',
    'Where does most of my money go?',
];

/**
 * The legacy assistant: plain-text chat over `aiApi` (`/ai/chat`).
 *
 * This was `AssistantSheet` until the v2 agent (plan.md §40.4); it is the
 * same code path, moved, so an account still on the legacy assistant sees
 * exactly what it saw before. `AssistantSheet` now picks between this and
 * the agent by the server's mode. The one addition is `initialPrompt`, which
 * prefills the input (never sends it) when a page opens the assistant with a
 * question in mind.
 *
 * Original notes:
 *
 * Moved out of a permanently-mounted sidebar panel and into a sheet opened from
 * Insights. Three reasons, in order of importance:
 *
 *   1. It was mounted on every authenticated screen, so its chat history
 *      request fired on every page load whether or not anyone opened it.
 *   2. Its trigger was a pulsing gradient button pinned above the navigation on
 *      every page — permanent motion, permanently competing with the four
 *      destinations a user actually needs.
 *   3. An assistant that follows you everywhere implies it can *do* things.
 *      This one cannot: it reads recent transactions and answers questions. It
 *      cannot send money, and presenting it with the prominence of an action
 *      surface sets an expectation the product does not meet.
 *
 * Two things kept from the old panel because they were right: page-awareness
 * (the current path is sent with each query) and server-persisted history.
 *
 * One thing fixed: `window.confirm` for clearing history is replaced with a
 * proper confirmation sheet. A native confirm dialog is unstyleable,
 * unlocalisable, and on mobile browsers renders as a jarring system alert that
 * looks like a browser warning rather than part of the product.
 */
const LegacyChat = ({ open, onClose, initialPrompt }) => {
    const location = useLocation();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);

    const endRef = useRef(null);

    useEffect(() => {
        if (open && initialPrompt) setInput(initialPrompt);
    }, [open, initialPrompt]);

    useEffect(() => {
        if (!open) return;

        let cancelled = false;
        setLoadingHistory(true);

        aiApi
            .getHistory()
            .then(({ data }) => {
                if (!cancelled) setMessages(data?.messages ?? []);
            })
            .catch(() => {
                // A failed history load is not worth an error state — the user
                // can still ask a question. Starting empty is a fine outcome.
            })
            .finally(() => {
                if (!cancelled) setLoadingHistory(false);
            });

        return () => {
            cancelled = true;
        };
    }, [open]);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [messages, sending]);

    const ask = async (query) => {
        const trimmed = query.trim();
        if (!trimmed || sending) return;

        setMessages((current) => [...current, { sender: 'user', text: trimmed }]);
        setInput('');
        setSending(true);

        try {
            const { data } = await aiApi.sendMessage({
                query: trimmed,
                path: location.pathname,
            });
            setMessages((current) => [
                ...current,
                { sender: 'ai', text: data?.response ?? "I couldn't work that one out." },
            ]);
        } catch (caught) {
            setMessages((current) => [
                ...current,
                {
                    sender: 'ai',
                    text: getErrorMessage(caught, "I couldn't reach my analysis service."),
                    failed: true,
                },
            ]);
        } finally {
            setSending(false);
        }
    };

    const clearHistory = async () => {
        try {
            await aiApi.clearHistory();
            setMessages([]);
        } catch {
            // Non-fatal; the history simply stays.
        } finally {
            setConfirmClear(false);
        }
    };

    return (
        <>
            <Sheet
                open={open}
                onClose={onClose}
                title="Assistant"
                description="Answers questions about your own transactions."
                size="lg"
                className="sm:h-[36rem]"
                footer={
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            ask(input);
                        }}
                        className="flex gap-2"
                    >
                        <Input
                            value={input}
                            onChange={(event) => setInput(event.target.value)}
                            placeholder="Ask about your spending"
                            aria-label="Ask the assistant"
                            disabled={sending}
                            className="flex-1"
                        />
                        <IconButton
                            label="Send message"
                            variant="primary"
                            type="submit"
                            disabled={!input.trim() || sending}
                        >
                            <Send size={17} />
                        </IconButton>
                    </form>
                }
            >
                <div className="flex min-h-full flex-col">
                    {messages.length > 0 && (
                        <div className="mb-2 flex justify-end">
                            <button
                                type="button"
                                onClick={() => setConfirmClear(true)}
                                className="inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-xs text-text-muted hover:bg-surface-hover hover:text-text"
                            >
                                <Trash2 size={13} aria-hidden="true" />
                                Clear history
                            </button>
                        </div>
                    )}

                    {loadingHistory ? (
                        <div className="grid flex-1 place-items-center py-10">
                            <Spinner tone="muted" />
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="flex flex-1 flex-col justify-center py-6 text-center">
                            <span
                                aria-hidden="true"
                                className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-ai-soft text-ai"
                            >
                                <LogoMark size={20} />
                            </span>
                            <p className="mt-3 text-sm font-medium text-text">
                                Ask about your transactions
                            </p>
                            <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-text-muted">
                                I can read your recent activity. I can't move money or change your
                                account.
                            </p>

                            {/* Suggestions, because a blank chat box is the
                                hardest possible interface to start using. */}
                            <div className="mt-4 flex flex-col gap-2">
                                {SUGGESTIONS.map((suggestion) => (
                                    <button
                                        key={suggestion}
                                        type="button"
                                        onClick={() => ask(suggestion)}
                                        className="rounded-control border border-border px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface-hover hover:text-text"
                                    >
                                        {suggestion}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <ul className="flex-1 space-y-3" aria-live="polite">
                            {messages.map((message, index) => (
                                <li
                                    key={index}
                                    className={cn(
                                        'flex',
                                        message.sender === 'user' ? 'justify-end' : 'justify-start'
                                    )}
                                >
                                    <div
                                        className={cn(
                                            'max-w-[85%] rounded-card px-3 py-2 text-sm leading-6',
                                            message.sender === 'user'
                                                ? 'bg-accent text-on-accent'
                                                : message.failed
                                                  ? 'bg-warning-soft text-text-secondary'
                                                  : 'bg-ai-soft/60 text-text'
                                        )}
                                    >
                                        {message.sender === 'ai' && (
                                            <span className="sr-only">Assistant said: </span>
                                        )}
                                        {message.text}
                                    </div>
                                </li>
                            ))}

                            {sending && (
                                <li className="flex justify-start">
                                    <div className="rounded-card bg-ai-soft/60 px-3 py-2.5">
                                        <Spinner size="sm" tone="muted" />
                                        <span className="sr-only">Assistant is typing</span>
                                    </div>
                                </li>
                            )}
                        </ul>
                    )}

                    <div ref={endRef} />

                    <p className="mt-4 text-center text-2xs text-text-muted">
                        AI-generated. Check anything important against your activity.
                    </p>
                </div>
            </Sheet>

            <ConfirmSheet
                open={confirmClear}
                onClose={() => setConfirmClear(false)}
                onConfirm={clearHistory}
                variant="danger"
                title="Clear chat history?"
                description="Your conversation will be deleted. Your transactions are not affected."
                confirmLabel="Clear"
            />
        </>
    );
};

export default LegacyChat;
