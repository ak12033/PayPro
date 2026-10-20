import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import AssistantSheet from './AssistantSheet';
import { agentApi } from '../../services/api/endpoints/agentApi';
import { aiApi } from '../../services/api/endpoints/aiApi';

vi.mock('../../services/api/endpoints/agentApi', () => ({
    agentApi: {
        getConfig: vi.fn(),
        getActiveConversation: vi.fn(),
        clearActiveConversation: vi.fn(),
        sendMessage: vi.fn(),
        confirmProposal: vi.fn(),
        cancelProposal: vi.fn(),
    },
}));

vi.mock('../../services/api/endpoints/aiApi', () => ({
    aiApi: { getHistory: vi.fn(), sendMessage: vi.fn(), clearHistory: vi.fn() },
}));

// Each flow here is several async hops (config → history → send → reply);
// the 1 s default flaked once with the whole suite running in parallel.
configure({ asyncUtilTimeout: 3000 });

const CONVERSATION = '11111111-1111-4111-8111-111111111111';
const V2 = { mode: 'v2', features: { multiturn: true, writeActions: true }, starters: [{ id: 'st_0', label: 'Where is my money?', kind: 'ask' }] };

const reply = (overrides = {}) => ({
    conversationId: CONVERSATION,
    messageId: `msg_${Math.random().toString(16).slice(2)}`,
    turnId: 't',
    outcome: 'ANSWER',
    message: 'Here you go.',
    blocks: [],
    suggestions: [],
    status: 'info',
    meta: { degraded: false, aiComposed: false },
    ...overrides,
});

const Where = () => <span data-testid="where">{useLocation().pathname + useLocation().search}</span>;

const renderSheet = (props = {}) => {
    const onClose = vi.fn();
    render(
        <MemoryRouter initialEntries={['/activity']}>
            <Routes>
                <Route
                    path="*"
                    element={
                        <>
                            <Where />
                            <AssistantSheet open onClose={onClose} {...props} />
                        </>
                    }
                />
            </Routes>
        </MemoryRouter>
    );
    return { onClose };
};

beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    aiApi.getHistory.mockResolvedValue({ data: { messages: [] } });
    agentApi.getActiveConversation.mockResolvedValue({ data: { conversation: null, messages: [] } });
});

describe('AssistantSheet — the server picks the assistant (plan.md §40.4)', () => {
    it('legacy mode renders the legacy chat and never touches the agent', async () => {
        agentApi.getConfig.mockResolvedValue({ data: { mode: 'legacy', features: {}, starters: [] } });
        renderSheet();

        expect(await screen.findByText('Ask about your transactions')).toBeInTheDocument();
        expect(screen.getByText('How much did I spend last month?')).toBeInTheDocument();
        expect(agentApi.getConfig).toHaveBeenCalledWith('/activity');
        await waitFor(() => expect(aiApi.getHistory).toHaveBeenCalledTimes(1));
        expect(agentApi.getActiveConversation).not.toHaveBeenCalled();
    });

    it('v2 mode renders the agent with the server starters and never touches /ai/chat', async () => {
        agentApi.getConfig.mockResolvedValue({ data: V2 });
        renderSheet();

        expect(await screen.findByText('How can I help?')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Where is my money?' })).toBeInTheDocument();
        expect(agentApi.getActiveConversation).toHaveBeenCalledTimes(1);
        expect(aiApi.getHistory).not.toHaveBeenCalled();
    });

    it('a failed config call falls back to legacy', async () => {
        agentApi.getConfig.mockRejectedValue(new Error('Network Error'));
        renderSheet();
        expect(await screen.findByText('Ask about your transactions')).toBeInTheDocument();
    });

    it('an unknown mode is legacy', async () => {
        agentApi.getConfig.mockResolvedValue({ data: { mode: 'v3' } });
        renderSheet();
        expect(await screen.findByText('Ask about your transactions')).toBeInTheDocument();
    });

    it('AGENT_DISABLED mid-session falls back to legacy', async () => {
        agentApi.getConfig.mockResolvedValue({ data: V2 });
        agentApi.getActiveConversation.mockRejectedValue(
            Object.assign(new Error('403'), { response: { status: 403, data: { code: 'AGENT_DISABLED' } } })
        );
        renderSheet();
        expect(await screen.findByText('Ask about your transactions')).toBeInTheDocument();
    });

    it('legacy prefills a page prompt but does not send it', async () => {
        agentApi.getConfig.mockResolvedValue({ data: { mode: 'legacy' } });
        renderSheet({ initialPrompt: 'Explain this transaction', initialResource: { type: 'transaction', id: 'tx1' } });

        expect(await screen.findByDisplayValue('Explain this transaction')).toBeInTheDocument();
        expect(aiApi.sendMessage).not.toHaveBeenCalled();
    });

    it('v2 sends a page prompt with its resource once history has loaded', async () => {
        agentApi.getConfig.mockResolvedValue({ data: V2 });
        agentApi.sendMessage.mockResolvedValue({ data: reply({ message: 'This was a transfer.' }) });
        renderSheet({ initialPrompt: 'Explain this transaction', initialResource: { type: 'transaction', id: 'tx1' } });

        expect(await screen.findByText('This was a transfer.')).toBeInTheDocument();
        expect(agentApi.sendMessage).toHaveBeenCalledTimes(1);
        expect(agentApi.sendMessage.mock.calls[0][0]).toMatchObject({
            text: 'Explain this transaction',
            context: { route: '/activity', resource: { type: 'transaction', id: 'tx1' } },
        });
    });

    it('v2: a reply renders its text, cards and chips; a chip sends its id', async () => {
        agentApi.getConfig.mockResolvedValue({ data: V2 });
        agentApi.sendMessage.mockResolvedValueOnce({
            data: reply({
                outcome: 'RESULT',
                message: 'Your withdrawal was not approved.',
                blocks: [
                    { type: 'withdrawal', fact: { id: 'w1', status: 'rejected', amountMinor: 200000, createdAt: '2026-10-20T10:00:00Z', userVisibleReason: 'Name mismatch' } },
                    { type: 'sparkline', points: [1, 2, 3] },
                ],
                suggestions: [{ id: 'sg_1', label: 'Talk to support', kind: 'action' }],
            }),
        });
        agentApi.sendMessage.mockResolvedValueOnce({ data: reply() });
        renderSheet();

        fireEvent.change(await screen.findByLabelText('Ask the assistant'), { target: { value: 'my withdrawal?' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

        expect(await screen.findByText('Your withdrawal was not approved.')).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'Withdrawal' })).toBeInTheDocument();
        expect(screen.getByText('Checked against your PayPro records')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Talk to support' }));
        await waitFor(() => expect(agentApi.sendMessage).toHaveBeenCalledTimes(2));
        expect(agentApi.sendMessage.mock.calls[1][0].action).toEqual({ type: 'suggestion', id: 'sg_1' });
        expect(agentApi.sendMessage.mock.calls[1][0].conversationId).toBe(CONVERSATION);
    });

    it('v2: only the latest reply keeps its chips', async () => {
        agentApi.getConfig.mockResolvedValue({ data: V2 });
        agentApi.sendMessage
            .mockResolvedValueOnce({ data: reply({ message: 'First.', suggestions: [{ id: 'sg_a', label: 'Old chip', kind: 'ask' }] }) })
            .mockResolvedValueOnce({ data: reply({ message: 'Second.', suggestions: [{ id: 'sg_b', label: 'New chip', kind: 'ask' }] }) });
        renderSheet();

        const input = await screen.findByLabelText('Ask the assistant');
        fireEvent.change(input, { target: { value: 'one' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
        await screen.findByText('Old chip');
        fireEvent.change(input, { target: { value: 'two' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

        expect(await screen.findByText('New chip')).toBeInTheDocument();
        expect(screen.queryByText('Old chip')).not.toBeInTheDocument();
    });

    it('v2: a link navigates and closes the sheet', async () => {
        agentApi.getConfig.mockResolvedValue({ data: V2 });
        agentApi.sendMessage.mockResolvedValue({
            data: reply({ outcome: 'NAVIGATE', message: 'You can add money here.', blocks: [{ type: 'link', label: 'Add money', route: '/money/add?amount=500' }] }),
        });
        const { onClose } = renderSheet();

        fireEvent.click(await screen.findByRole('button', { name: 'Where is my money?' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Add money' }));

        expect(screen.getByTestId('where')).toHaveTextContent('/money/add?amount=500');
        expect(onClose).toHaveBeenCalled();
    });

    it('v2: the confirm flow runs through the card', async () => {
        agentApi.getConfig.mockResolvedValue({ data: V2 });
        agentApi.sendMessage.mockResolvedValue({
            data: reply({
                outcome: 'CONFIRM',
                message: 'Cancel this withdrawal?',
                blocks: [{
                    type: 'confirm', proposalId: 'pr_0123456789abcdef01234567', title: 'Cancel withdrawal',
                    lines: [{ label: 'Amount', value: '₹2,000', amountMinor: 200000 }],
                    irreversible: false, danger: false, expiresAt: '2026-10-20T10:05:00Z', nonce: 'n-1',
                }],
            }),
        });
        agentApi.confirmProposal.mockResolvedValue({
            data: reply({ outcome: 'ACTION_DONE', message: 'Withdrawal of ₹2,000 cancelled.' }),
        });
        renderSheet();

        fireEvent.change(await screen.findByLabelText('Ask the assistant'), { target: { value: 'cancel it' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

        const card = await screen.findByRole('group', { name: 'Cancel withdrawal' });
        await waitFor(() => expect(card).toHaveFocus());
        fireEvent.click(screen.getByRole('button', { name: 'Confirm: Cancel withdrawal, ₹2,000.00' }));

        expect(await screen.findByText('Withdrawal of ₹2,000 cancelled.')).toBeInTheDocument();
        expect(agentApi.confirmProposal).toHaveBeenCalledWith('pr_0123456789abcdef01234567', 'n-1');
        // The card is a record now, not a decision.
        expect(screen.queryByRole('button', { name: /^Confirm:/ })).not.toBeInTheDocument();
    });

    it('v2: a failed send offers Retry with the same id', async () => {
        agentApi.getConfig.mockResolvedValue({ data: V2 });
        agentApi.sendMessage
            .mockRejectedValueOnce(new Error('Network Error'))
            .mockResolvedValueOnce({ data: reply({ message: 'Got it.' }) });
        renderSheet();

        fireEvent.change(await screen.findByLabelText('Ask the assistant'), { target: { value: 'hello' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));

        expect(await screen.findByText('Got it.')).toBeInTheDocument();
        const [first, second] = agentApi.sendMessage.mock.calls.map(([body]) => body.clientMessageId);
        expect(second).toBe(first);
    });

    it('v2: unavailable (503) shows the error state with a way to support', async () => {
        agentApi.getConfig.mockResolvedValue({ data: V2 });
        agentApi.getActiveConversation.mockRejectedValue(
            Object.assign(new Error('503'), { response: { status: 503, data: {} } })
        );
        const { onClose } = renderSheet();

        expect(await screen.findByText('The assistant is unavailable')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Talk to support' }));
        expect(screen.getByTestId('where')).toHaveTextContent('/account/support');
        expect(onClose).toHaveBeenCalled();
    });

    it('v2: degraded and AI-composed replies say so', async () => {
        agentApi.getConfig.mockResolvedValue({ data: V2 });
        agentApi.sendMessage.mockResolvedValue({
            data: reply({ message: 'Phrased reply.', meta: { degraded: true, aiComposed: true } }),
        });
        renderSheet();

        fireEvent.click(await screen.findByRole('button', { name: 'Where is my money?' }));
        expect(await screen.findByText('Some checks are temporarily unavailable.')).toBeInTheDocument();
        expect(screen.getByText(/AI-generated/)).toBeInTheDocument();
    });
});
