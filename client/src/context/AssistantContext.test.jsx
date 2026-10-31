import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { configure, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AssistantProvider } from './AssistantContext';
import { useAssistant } from './useAssistant';
import { agentApi } from '../services/api/endpoints/agentApi';
import { aiApi } from '../services/api/endpoints/aiApi';

vi.mock('../services/api/endpoints/agentApi', () => ({
    agentApi: {
        getConfig: vi.fn(),
        getActiveConversation: vi.fn(),
        clearActiveConversation: vi.fn(),
        sendMessage: vi.fn(),
        confirmProposal: vi.fn(),
        cancelProposal: vi.fn(),
    },
}));

vi.mock('../services/api/endpoints/aiApi', () => ({
    aiApi: { getHistory: vi.fn(), sendMessage: vi.fn(), clearHistory: vi.fn(), getInsights: vi.fn() },
}));

// Opening resolves a lazy import, then config, then history; under the full
// parallel suite that has taken longer than the 1 s default.
configure({ asyncUtilTimeout: 3000 });

/**
 * DEF-06: the slow step was the lazy sheet's *first* import, which transforms
 * its whole module graph — under parallel load that alone could outlast the
 * timeout above. Importing it once here, outside any test's clock, means every
 * `lazy()` below resolves from the module cache. What the tests check (nothing
 * mounts or fetches until opened) does not depend on the chunk being cold.
 */
beforeAll(async () => {
    await import('../features/ai/AssistantSheet');
}, 30000);

const Opener = () => {
    const { openAssistant, available } = useAssistant();
    return (
        <button type="button" onClick={() => openAssistant({ prompt: 'Help me' })} data-available={available}>
            Open
        </button>
    );
};

const renderShell = () =>
    render(
        <MemoryRouter initialEntries={['/insights']}>
            <AssistantProvider>
                <Opener />
            </AssistantProvider>
        </MemoryRouter>
    );

beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    agentApi.getConfig.mockResolvedValue({ data: { mode: 'legacy', features: {}, starters: [] } });
    aiApi.getHistory.mockResolvedValue({ data: { messages: [] } });
});

describe('AssistantContext (plan.md §25.1)', () => {
    it('fetches nothing and renders no sheet until opened', async () => {
        renderShell();
        // Give a lazy import every chance to (wrongly) resolve.
        await new Promise((r) => setTimeout(r, 20));

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(agentApi.getConfig).not.toHaveBeenCalled();
        expect(agentApi.getActiveConversation).not.toHaveBeenCalled();
        expect(aiApi.getHistory).not.toHaveBeenCalled();
    });

    it('opening mounts the lazy sheet, which asks the server for its mode', async () => {
        renderShell();
        fireEvent.click(screen.getByRole('button', { name: 'Open' }));

        expect(await screen.findByRole('dialog', { name: 'Assistant' })).toBeInTheDocument();
        expect(agentApi.getConfig).toHaveBeenCalledWith('/insights');
        expect(await screen.findByDisplayValue('Help me')).toBeInTheDocument();
    });

    it('closing unmounts the dialog; reopening asks again', async () => {
        renderShell();
        fireEvent.click(screen.getByRole('button', { name: 'Open' }));
        await screen.findByDisplayValue('Help me');

        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Open' }));
        await screen.findByDisplayValue('Help me');
        expect(agentApi.getConfig).toHaveBeenCalledTimes(2);
    });

    it('outside the provider there is no assistant to open', () => {
        render(<Opener />);
        const button = screen.getByRole('button', { name: 'Open' });
        expect(button).toHaveAttribute('data-available', 'false');
        fireEvent.click(button); // a no-op, not a crash
    });
});
