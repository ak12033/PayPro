import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AssistantLauncher from './AssistantLauncher';
import { AssistantContext } from '../../context/useAssistant';

const renderWith = (value) =>
    render(
        <AssistantContext.Provider value={value}>
            <AssistantLauncher />
        </AssistantContext.Provider>
    );

describe('AssistantLauncher', () => {
    it('opens the assistant with no preset prompt', () => {
        const openAssistant = vi.fn();
        renderWith({ openAssistant, available: true, isOpen: false });

        fireEvent.click(screen.getByRole('button', { name: 'Chat with PayPro' }));
        expect(openAssistant).toHaveBeenCalledWith();
    });

    it('steps aside while the assistant is open', () => {
        renderWith({ openAssistant: vi.fn(), available: true, isOpen: true });
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('renders nothing outside the shell', () => {
        render(<AssistantLauncher />);
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});
