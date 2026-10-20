import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Send, Trash2 } from 'lucide-react';
import LogoMark from '../../../components/ui/LogoMark';
import Sheet, { ConfirmSheet } from '../../../components/ui/Sheet';
import Button, { IconButton } from '../../../components/ui/Button';
import Spinner from '../../../components/ui/Spinner';
import { Input } from '../../../components/ui/Field';
import ErrorState from '../../../components/feedback/ErrorState';
import { ROUTES } from '../../../constants/routes';
import AgentMessageList from './AgentMessageList';
import useAgentConversation from './useAgentConversation';

const MAX_ROUTE = 200;

/**
 * The v2 assistant (plan.md §25): the same sheet, with typed cards, chips
 * and confirmations under the agent's messages. Every card's content was
 * verified server-side; this component decides only what can be tapped.
 *
 * `initialResource` is the record the user opened the assistant from (a
 * transaction, a payment); it travels as page context on every message of
 * this opening, and the server re-reads it before trusting it (§23.2).
 * `initialPrompt` is sent once history has loaded.
 */
const AgentChat = ({ open, onClose, config, initialPrompt, initialResource, onDisabled }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const [input, setInput] = useState('');
    const [confirmClear, setConfirmClear] = useState(false);
    const endRef = useRef(null);
    const promptSent = useRef(false);

    const context = {
        route: location.pathname.slice(0, MAX_ROUTE),
        ...(initialResource?.type && initialResource?.id && {
            resource: { type: initialResource.type, id: String(initialResource.id) },
        }),
    };

    const conversation = useAgentConversation({ enabled: open, context, onDisabled });
    const { messages, loading, sending, executing, unavailable, send } = conversation;
    const busy = sending || Boolean(executing);

    useEffect(() => {
        if (!open) promptSent.current = false;
    }, [open]);

    useEffect(() => {
        if (!open || loading || unavailable || !initialPrompt || promptSent.current) return;
        promptSent.current = true;
        send(initialPrompt);
    }, [open, loading, unavailable, initialPrompt, send]);

    useEffect(() => {
        endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
    }, [messages, sending]);

    const submit = (event) => {
        event.preventDefault();
        if (!input.trim() || busy) return;
        send(input);
        setInput('');
    };

    const goTo = (route) => {
        navigate(route);
        onClose();
    };

    const clearHistory = async () => {
        try {
            await conversation.clear();
        } catch {
            // Non-fatal; the conversation simply stays.
        } finally {
            setConfirmClear(false);
        }
    };

    let body;
    if (unavailable) {
        body = (
            <ErrorState
                title="The assistant is unavailable"
                message="It should be back shortly. Support can help in the meantime."
                action={
                    <Button variant="secondary" onClick={() => goTo(ROUTES.SUPPORT)}>
                        Talk to support
                    </Button>
                }
            />
        );
    } else if (loading) {
        body = (
            <div className="grid flex-1 place-items-center py-10">
                <Spinner tone="muted" />
            </div>
        );
    } else if (messages.length === 0) {
        body = (
            <div className="flex flex-1 flex-col justify-center py-6 text-center">
                <span
                    aria-hidden="true"
                    className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-ai-soft text-ai"
                >
                    <LogoMark size={20} />
                </span>
                <p className="mt-3 text-sm font-medium text-text">How can I help?</p>
                <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-text-muted">
                    I can check your payments, transfers and withdrawals, and help with your account.
                    Anything that changes something asks you first.
                </p>

                {config.starters.length > 0 && (
                    <div className="mt-4 flex flex-col gap-2">
                        {config.starters.map((starter) => (
                            <button
                                key={starter.id}
                                type="button"
                                disabled={busy}
                                onClick={() => send(starter.label)}
                                className="rounded-control border border-border px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface-hover hover:text-text"
                            >
                                {starter.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        );
    } else {
        body = (
            <AgentMessageList
                conversation={conversation}
                onNavigate={goTo}
                feedback={Boolean(config.features?.feedback)}
            />
        );
    }

    return (
        <>
            <Sheet
                open={open}
                onClose={onClose}
                title="Assistant"
                description="Answers questions and helps with your PayPro account."
                size="lg"
                className="sm:h-[36rem]"
                footer={
                    <form onSubmit={submit} className="flex gap-2">
                        <Input
                            value={input}
                            onChange={(event) => setInput(event.target.value)}
                            placeholder="Ask about your money or account"
                            aria-label="Ask the assistant"
                            maxLength={2000}
                            disabled={busy || unavailable}
                            className="flex-1"
                        />
                        <IconButton
                            label="Send message"
                            variant="primary"
                            type="submit"
                            disabled={!input.trim() || busy || unavailable}
                        >
                            <Send size={17} />
                        </IconButton>
                    </form>
                }
            >
                <div className="flex min-h-full flex-col">
                    {messages.length > 0 && !unavailable && (
                        <div className="mb-2 flex justify-end">
                            <button
                                type="button"
                                onClick={() => setConfirmClear(true)}
                                disabled={busy}
                                className="inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-xs text-text-muted hover:bg-surface-hover hover:text-text"
                            >
                                <Trash2 size={13} aria-hidden="true" />
                                Clear history
                            </button>
                        </div>
                    )}

                    {body}

                    <div ref={endRef} />
                </div>
            </Sheet>

            <ConfirmSheet
                open={confirmClear}
                onClose={() => setConfirmClear(false)}
                onConfirm={clearHistory}
                variant="danger"
                title="Clear chat history?"
                description="Your conversation will be deleted, and anything waiting for your confirmation is cancelled. Your transactions are not affected."
                confirmLabel="Clear"
            />
        </>
    );
};

export default AgentChat;
