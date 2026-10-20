import aiClient from '../aiClient';

/**
 * The v2 assistant (plan.md §42.1). Same origin and bearer as `aiApi`, which
 * stays: the sheet speaks whichever one `/ai/agent/config` says this account
 * is on, so an old bundle and a new server (or the reverse) still agree.
 *
 * Nothing here is called until the assistant is opened.
 */
export const agentApi = {
    /** `route` makes the starter chips page-aware. */
    getConfig: (route) => aiClient.get('/ai/agent/config', { params: route ? { route } : undefined }),

    getActiveConversation: () => aiClient.get('/ai/agent/conversations/active'),

    clearActiveConversation: () => aiClient.delete('/ai/agent/conversations/active'),

    /**
     * Exactly one of `text` / `action`. `clientMessageId` is the idempotency
     * key: a retry reuses it, so a resend after a lost response replays the
     * stored reply instead of running the turn twice.
     */
    sendMessage: ({ conversationId, clientMessageId, text, action, context }) =>
        aiClient.post('/ai/agent/messages', {
            ...(conversationId && { conversationId }),
            clientMessageId,
            ...(text !== undefined ? { text } : { action }),
            ...(context && { context }),
        }),

    confirmProposal: (proposalId, nonce) =>
        aiClient.post(`/ai/agent/proposals/${encodeURIComponent(proposalId)}/confirm`, { nonce }),

    cancelProposal: (proposalId) =>
        aiClient.post(`/ai/agent/proposals/${encodeURIComponent(proposalId)}/cancel`),

    /** §31.4: `rating` is "up" | "down"; `reason` optional ("wrong" | "unhelpful" | "unsafe" | "other"). */
    sendFeedback: (messageId, rating, reason) =>
        aiClient.post(`/ai/agent/messages/${encodeURIComponent(messageId)}/feedback`, {
            rating,
            ...(reason && { reason }),
        }),
};

export default agentApi;
