import { useCallback, useEffect, useRef, useState } from 'react';
import { agentApi } from '../../../services/api/endpoints/agentApi';
import { createIdempotencyKey } from '../../../lib/idempotency';
import { getErrorMessage } from '../../../utils/errors';

/** Labels the server records for a card's buttons, echoed so live and reloaded history match. */
const CONFIRM_LABEL = 'Confirm';
const CANCEL_LABEL = 'Cancel';

const LOST_CONFIRMATION =
    "We lost the connection before hearing back, so this may or may not have gone through. Check your activity before trying again.";

const fromHistory = (stored) =>
    stored.map((m) =>
        m.role === 'agent' && m.reply
            ? { key: m.messageId, role: 'agent', reply: m.reply }
            : { key: m.messageId, role: 'user', text: m.text, status: 'sent' }
    );

/**
 * One v2 conversation (plan.md §43.1).
 *
 * The server owns the conversation; this hook owns only what is on screen:
 * the optimistic user bubble, which request failed and can be retried, and
 * which confirmation is executing. Every outgoing message carries a fresh
 * `clientMessageId`, kept on its bubble so **Retry** resends the same id and
 * the server replays rather than re-runs the turn.
 *
 * `onDisabled` fires on 403 `AGENT_DISABLED` (the account left the rollout
 * while the sheet was open), so the sheet can fall back to the legacy chat.
 */
export const useAgentConversation = ({ enabled, context, onDisabled }) => {
    const [conversationId, setConversationId] = useState(null);
    const [messages, setMessages] = useState([]);
    // Loading from the first render when enabled: otherwise a caller waiting
    // for history (AgentChat's initial prompt) sees `false` before the fetch
    // starts, sends, and the arriving history then replaces its bubble.
    const [loading, setLoading] = useState(Boolean(enabled));
    const [sending, setSending] = useState(false);
    const [executing, setExecuting] = useState(null);
    const [unavailable, setUnavailable] = useState(false);
    // Cards the server has already settled (404/409 on confirm): never offered again.
    const [closedProposals, setClosedProposals] = useState(() => new Set());

    const keyRef = useRef(0);
    const nextKey = useCallback(() => `local-${(keyRef.current += 1)}`, []);

    // Read at call time, so the hook's callbacks stay stable across renders.
    const latest = useRef({ conversationId, context, onDisabled, messages });
    latest.current = { conversationId, context, onDisabled, messages };

    /** True when the error was handled as a mode change or an outage. */
    const handleServiceError = useCallback((caught) => {
        const status = caught?.response?.status;
        if (status === 403 && caught.response.data?.code === 'AGENT_DISABLED') {
            latest.current.onDisabled?.();
            return true;
        }
        if (status === 503) {
            setUnavailable(true);
            return true;
        }
        return false;
    }, []);

    useEffect(() => {
        if (!enabled) return undefined;

        let cancelled = false;
        setLoading(true);
        setUnavailable(false);

        agentApi
            .getActiveConversation()
            .then(({ data }) => {
                if (cancelled) return;
                setConversationId(data?.conversation?.id ?? null);
                setMessages(fromHistory(data?.messages ?? []));
            })
            .catch((caught) => {
                // Anything but a mode change or an outage starts empty, as the
                // legacy chat does: the user can still ask.
                if (!cancelled) handleServiceError(caught);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [enabled, handleServiceError]);

    const appendReply = useCallback(
        (reply) => {
            setConversationId(reply.conversationId ?? null);
            setMessages((current) => [...current, { key: reply.messageId || nextKey(), role: 'agent', reply }]);
        },
        [nextKey]
    );

    const deliver = useCallback(async (key, request) => {
        setSending(true);
        try {
            const { data } = await agentApi.sendMessage(request);
            setMessages((current) =>
                current.map((m) => (m.key === key ? { ...m, status: 'sent', error: null } : m))
            );
            appendReply(data);
        } catch (caught) {
            if (handleServiceError(caught)) {
                setMessages((current) => current.filter((m) => m.key !== key));
                return;
            }
            setMessages((current) =>
                current.map((m) =>
                    m.key === key
                        ? {
                              ...m,
                              status: 'failed',
                              error: getErrorMessage(caught, "I couldn't reach the assistant."),
                          }
                        : m
                )
            );
        } finally {
            setSending(false);
        }
    }, [appendReply, handleServiceError]);

    const post = useCallback(
        (label, payload) => {
            const { conversationId: id, context: ctx } = latest.current;
            const request = {
                conversationId: id,
                clientMessageId: createIdempotencyKey(),
                ...payload,
                context: ctx,
            };
            const key = nextKey();
            setMessages((current) => [
                ...current,
                { key, role: 'user', text: label, status: 'sending', request },
            ]);
            return deliver(key, request);
        },
        [deliver, nextKey]
    );

    const send = useCallback(
        (text) => {
            const trimmed = String(text ?? '').trim();
            if (!trimmed) return undefined;
            return post(trimmed, { text: trimmed });
        },
        [post]
    );

    /** A chip, option or pick row: the label is the user's bubble, the id is what is sent. */
    const act = useCallback((action, label) => post(label, { action: { type: action.type, id: action.id } }), [post]);

    /** Resends the failed message with its original `clientMessageId`. */
    const retry = useCallback(
        (key) => {
            const failed = latest.current.messages.find((m) => m.key === key && m.status === 'failed');
            if (!failed?.request) return undefined;
            setMessages((current) =>
                current.map((m) => (m.key === key ? { ...m, status: 'sending', error: null } : m))
            );
            return deliver(key, failed.request);
        },
        [deliver]
    );

    const settle = useCallback(async (proposalId, label, call) => {
        setExecuting(proposalId);
        try {
            const { data } = await call();
            setMessages((current) => [...current, { key: nextKey(), role: 'user', text: label, status: 'sent' }]);
            appendReply(data);
        } catch (caught) {
            if (handleServiceError(caught)) return;
            const status = caught?.response?.status;
            if (status === 404 || status === 409) {
                setClosedProposals((current) => new Set(current).add(proposalId));
            }
            setMessages((current) => [
                ...current,
                {
                    key: nextKey(),
                    role: 'error',
                    // No response at all: the write may have happened. Never
                    // "nothing changed" (plan.md §16.2).
                    text: caught?.response ? getErrorMessage(caught, LOST_CONFIRMATION) : LOST_CONFIRMATION,
                },
            ]);
        } finally {
            setExecuting(null);
        }
    }, [appendReply, handleServiceError, nextKey]);

    const confirm = useCallback(
        (proposalId, nonce) =>
            settle(proposalId, CONFIRM_LABEL, () => agentApi.confirmProposal(proposalId, nonce)),
        [settle]
    );

    const cancel = useCallback(
        (proposalId) => settle(proposalId, CANCEL_LABEL, () => agentApi.cancelProposal(proposalId)),
        [settle]
    );

    /** Throws on failure so the caller can keep its confirmation sheet honest. */
    const clear = useCallback(async () => {
        await agentApi.clearActiveConversation();
        setConversationId(null);
        setMessages([]);
        setClosedProposals(new Set());
    }, []);

    return {
        conversationId,
        messages,
        loading,
        sending,
        executing,
        unavailable,
        closedProposals,
        send,
        act,
        retry,
        confirm,
        cancel,
        clear,
    };
};

export default useAgentConversation;
