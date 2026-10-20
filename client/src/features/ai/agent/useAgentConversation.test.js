import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAgentConversation } from './useAgentConversation';
import { agentApi } from '../../../services/api/endpoints/agentApi';

vi.mock('../../../services/api/endpoints/agentApi', () => ({
    agentApi: {
        getActiveConversation: vi.fn(),
        clearActiveConversation: vi.fn(),
        sendMessage: vi.fn(),
        confirmProposal: vi.fn(),
        cancelProposal: vi.fn(),
    },
}));

const CONVERSATION = '11111111-1111-4111-8111-111111111111';

const reply = (overrides = {}) => ({
    conversationId: CONVERSATION,
    messageId: `msg_${Math.random().toString(16).slice(2)}`,
    turnId: 't1',
    outcome: 'ANSWER',
    message: 'Here you go.',
    blocks: [],
    suggestions: [],
    status: 'info',
    meta: { degraded: false, aiComposed: false },
    ...overrides,
});

const httpError = (status, data = {}) => Object.assign(new Error('http'), { response: { status, data } });

const CONTEXT = { route: '/activity', resource: { type: 'transaction', id: 'abc' } };

const setup = async (props = {}) => {
    const hook = renderHook((p) => useAgentConversation(p), {
        initialProps: { enabled: true, context: CONTEXT, onDisabled: vi.fn(), ...props },
    });
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    return hook;
};

beforeEach(() => {
    vi.clearAllMocks();
    agentApi.getActiveConversation.mockResolvedValue({ data: { conversation: null, messages: [] } });
});

describe('useAgentConversation (plan.md §43.1)', () => {
    it('fetches nothing while disabled', () => {
        renderHook(() => useAgentConversation({ enabled: false, context: CONTEXT }));
        expect(agentApi.getActiveConversation).not.toHaveBeenCalled();
    });

    it('loads the active conversation into bubbles', async () => {
        const stored = reply({ messageId: 'msg_a' });
        agentApi.getActiveConversation.mockResolvedValue({
            data: {
                conversation: { id: CONVERSATION, status: 'active', startedAt: '2026-10-20T10:00:00Z' },
                messages: [
                    { messageId: 'msg_u', role: 'user', text: 'Where is my refund?' },
                    { messageId: 'msg_a', role: 'agent', text: 'Here you go.', reply: stored },
                ],
            },
        });
        const { result } = await setup();

        expect(result.current.conversationId).toBe(CONVERSATION);
        expect(result.current.messages).toEqual([
            { key: 'msg_u', role: 'user', text: 'Where is my refund?', status: 'sent' },
            { key: 'msg_a', role: 'agent', reply: stored },
        ]);
    });

    it('shows the user bubble optimistically, then the reply, carrying id and context', async () => {
        let resolve;
        agentApi.sendMessage.mockReturnValue(new Promise((r) => (resolve = r)));
        const { result } = await setup();

        act(() => {
            result.current.send('  why was I charged?  ');
        });
        expect(result.current.sending).toBe(true);
        expect(result.current.messages).toHaveLength(1);
        expect(result.current.messages[0]).toMatchObject({ role: 'user', text: 'why was I charged?', status: 'sending' });

        const request = agentApi.sendMessage.mock.calls[0][0];
        expect(request).toMatchObject({ conversationId: null, text: 'why was I charged?', context: CONTEXT });
        expect(request.clientMessageId).toMatch(/^[0-9a-f-]{36}$/);

        await act(async () => resolve({ data: reply() }));
        expect(result.current.sending).toBe(false);
        expect(result.current.messages.map((m) => m.role)).toEqual(['user', 'agent']);
        expect(result.current.messages[0].status).toBe('sent');
        expect(result.current.conversationId).toBe(CONVERSATION);
    });

    it('sends the next message into the conversation the last reply named', async () => {
        agentApi.sendMessage.mockResolvedValue({ data: reply() });
        const { result } = await setup();
        await act(() => result.current.send('one'));
        await act(() => result.current.send('two'));
        expect(agentApi.sendMessage.mock.calls[1][0].conversationId).toBe(CONVERSATION);
    });

    it('retries a failed message with the same clientMessageId', async () => {
        agentApi.sendMessage.mockRejectedValueOnce(new Error('Network Error'));
        agentApi.sendMessage.mockResolvedValueOnce({ data: reply() });
        const { result } = await setup();

        await act(() => result.current.send('hello'));
        const failed = result.current.messages[0];
        expect(failed.status).toBe('failed');
        expect(failed.error).toBeTruthy();

        await act(() => result.current.retry(failed.key));
        const [first, second] = agentApi.sendMessage.mock.calls.map(([body]) => body);
        expect(second.clientMessageId).toBe(first.clientMessageId);
        expect(result.current.messages.map((m) => m.role)).toEqual(['user', 'agent']);
        expect(result.current.messages[0].status).toBe('sent');
    });

    it('a new message gets a new clientMessageId', async () => {
        agentApi.sendMessage.mockResolvedValue({ data: reply() });
        const { result } = await setup();
        await act(() => result.current.send('one'));
        await act(() => result.current.send('two'));
        const [a, b] = agentApi.sendMessage.mock.calls.map(([body]) => body.clientMessageId);
        expect(a).not.toBe(b);
    });

    it('sends a chip as an action, with its label as the bubble', async () => {
        agentApi.sendMessage.mockResolvedValue({ data: reply() });
        const { result } = await setup();
        await act(() => result.current.act({ type: 'suggestion', id: 'sg_1', extra: 'dropped' }, 'Talk to support'));

        const body = agentApi.sendMessage.mock.calls[0][0];
        expect(body.action).toEqual({ type: 'suggestion', id: 'sg_1' });
        expect(body.text).toBeUndefined();
        expect(result.current.messages[0].text).toBe('Talk to support');
    });

    it('marks the proposal executing during confirm, then records Confirm and the result', async () => {
        let resolve;
        agentApi.confirmProposal.mockReturnValue(new Promise((r) => (resolve = r)));
        const { result } = await setup();

        act(() => {
            result.current.confirm('pr_1', 'nonce-1');
        });
        expect(result.current.executing).toBe('pr_1');
        expect(agentApi.confirmProposal).toHaveBeenCalledWith('pr_1', 'nonce-1');

        await act(async () => resolve({ data: reply({ outcome: 'ACTION_DONE' }) }));
        expect(result.current.executing).toBeNull();
        expect(result.current.messages.map((m) => [m.role, m.text ?? m.reply.outcome])).toEqual([
            ['user', 'Confirm'],
            ['agent', 'ACTION_DONE'],
        ]);
    });

    it('a confirm with no response never claims nothing happened', async () => {
        agentApi.confirmProposal.mockRejectedValue(new Error('timeout'));
        const { result } = await setup();
        await act(() => result.current.confirm('pr_1', 'n'));

        const last = result.current.messages.at(-1);
        expect(last.role).toBe('error');
        expect(last.text).toMatch(/may or may not have gone through/);
        expect(result.current.closedProposals.has('pr_1')).toBe(false); // retry stays possible (§28.2)
    });

    it('a confirm the server already settled closes that card', async () => {
        agentApi.confirmProposal.mockRejectedValue(
            httpError(409, { message: 'That was already handled.', code: 'PROPOSAL_ALREADY_HANDLED' })
        );
        const { result } = await setup();
        await act(() => result.current.confirm('pr_1', 'n'));

        expect(result.current.closedProposals.has('pr_1')).toBe(true);
        expect(result.current.messages.at(-1).text).toBe('That was already handled.');
    });

    it('cancel records Cancel and the reply', async () => {
        agentApi.cancelProposal.mockResolvedValue({ data: reply({ message: 'Okay, nothing was changed.' }) });
        const { result } = await setup();
        await act(() => result.current.cancel('pr_1'));
        expect(agentApi.cancelProposal).toHaveBeenCalledWith('pr_1');
        expect(result.current.messages.map((m) => m.role)).toEqual(['user', 'agent']);
        expect(result.current.messages[0].text).toBe('Cancel');
    });

    it('AGENT_DISABLED hands back to the legacy chat and drops the bubble', async () => {
        const onDisabled = vi.fn();
        agentApi.sendMessage.mockRejectedValue(httpError(403, { code: 'AGENT_DISABLED' }));
        const { result } = await setup({ onDisabled });
        await act(() => result.current.send('hi'));
        expect(onDisabled).toHaveBeenCalledTimes(1);
        expect(result.current.messages).toEqual([]);
    });

    it('AGENT_DISABLED on the history load hands back too', async () => {
        const onDisabled = vi.fn();
        agentApi.getActiveConversation.mockRejectedValue(httpError(403, { code: 'AGENT_DISABLED' }));
        await setup({ onDisabled });
        expect(onDisabled).toHaveBeenCalledTimes(1);
    });

    it('a 503 is the unavailable state, not a failed bubble', async () => {
        agentApi.sendMessage.mockRejectedValue(httpError(503, { message: 'down' }));
        const { result } = await setup();
        await act(() => result.current.send('hi'));
        expect(result.current.unavailable).toBe(true);
        expect(result.current.messages).toEqual([]);
    });

    it('clear deletes the conversation and empties the list', async () => {
        agentApi.sendMessage.mockResolvedValue({ data: reply() });
        agentApi.clearActiveConversation.mockResolvedValue({ data: {} });
        const { result } = await setup();
        await act(() => result.current.send('hi'));
        await act(() => result.current.clear());
        expect(result.current.messages).toEqual([]);
        expect(result.current.conversationId).toBeNull();
    });
});
