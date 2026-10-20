import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ReplyFeedback from './ReplyFeedback';
import AgentMessageList from './AgentMessageList';
import agentApi from '../../../services/api/endpoints/agentApi';

vi.mock('../../../services/api/endpoints/agentApi', () => ({
    default: { sendFeedback: vi.fn() },
}));

const MESSAGE_ID = 'msg_0123456789abcdef';

beforeEach(() => {
    agentApi.sendFeedback.mockReset();
});

describe('ReplyFeedback (plan.md §31.4)', () => {
    it('sends the rating for this reply and thanks the user', async () => {
        agentApi.sendFeedback.mockResolvedValue({ data: { ok: true } });
        render(<ReplyFeedback messageId={MESSAGE_ID} />);

        fireEvent.click(screen.getByRole('button', { name: 'Not helpful' }));

        expect(agentApi.sendFeedback).toHaveBeenCalledWith(MESSAGE_ID, 'down');
        expect(await screen.findByRole('status')).toHaveTextContent('Thanks for the feedback');
        expect(screen.getByRole('button', { name: 'Not helpful' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'Helpful' })).toBeDisabled();
    });

    it('rates once', async () => {
        agentApi.sendFeedback.mockResolvedValue({ data: { ok: true } });
        render(<ReplyFeedback messageId={MESSAGE_ID} />);
        fireEvent.click(screen.getByRole('button', { name: 'Helpful' }));
        await screen.findByRole('status');
        fireEvent.click(screen.getByRole('button', { name: 'Helpful' }));
        expect(agentApi.sendFeedback).toHaveBeenCalledTimes(1);
    });

    it('a failed send stays quiet and lets the user try again', async () => {
        agentApi.sendFeedback.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({});
        render(<ReplyFeedback messageId={MESSAGE_ID} />);

        fireEvent.click(screen.getByRole('button', { name: 'Helpful' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Helpful' })).not.toBeDisabled());
        expect(screen.queryByRole('status')).toBeNull();
        expect(screen.queryByRole('alert')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Helpful' }));
        expect(await screen.findByRole('status')).toBeInTheDocument();
    });
});

describe('AgentMessageList feedback placement', () => {
    const conversation = (reply) => ({
        messages: [{ key: 'a1', role: 'agent', reply }],
        sending: false,
        executing: null,
        closedProposals: new Set(),
        act: vi.fn(),
        confirm: vi.fn(),
        cancel: vi.fn(),
        retry: vi.fn(),
    });
    const reply = (overrides = {}) => ({
        messageId: MESSAGE_ID,
        outcome: 'RESULT',
        message: 'Your balance is ₹1,234.56.',
        blocks: [],
        suggestions: [],
        status: 'success',
        meta: {},
        ...overrides,
    });

    it('shows thumbs only when the server enables feedback', () => {
        const { rerender } = render(<AgentMessageList conversation={conversation(reply())} onNavigate={vi.fn()} />);
        expect(screen.queryByRole('group', { name: 'Rate this reply' })).toBeNull();

        rerender(<AgentMessageList conversation={conversation(reply())} onNavigate={vi.fn()} feedback />);
        expect(screen.getByRole('group', { name: 'Rate this reply' })).toBeInTheDocument();
    });

    it('never on a confirmation card', () => {
        const card = reply({ outcome: 'CONFIRM', proposal: { proposalId: 'pr_1' } });
        render(<AgentMessageList conversation={conversation(card)} onNavigate={vi.fn()} feedback />);
        expect(screen.queryByRole('group', { name: 'Rate this reply' })).toBeNull();
    });
});
