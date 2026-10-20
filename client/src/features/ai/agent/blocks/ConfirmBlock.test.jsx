import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ConfirmBlock from './ConfirmBlock';

const block = (overrides = {}) => ({
    type: 'confirm',
    proposalId: 'pr_0123456789abcdef01234567',
    title: 'Cancel withdrawal',
    lines: [
        { label: 'Amount', value: '₹2,000', amountMinor: 200000 },
        { label: 'To', value: 'XXXX1234' },
    ],
    irreversible: true,
    danger: false,
    expiresAt: '2026-10-20T10:05:00Z',
    nonce: 'nonce-1',
    ...overrides,
});

const setup = ({ block: changes, ...props } = {}) => {
    const handlers = { onConfirm: vi.fn(), onCancel: vi.fn() };
    render(<ConfirmBlock block={block(changes)} interactive {...handlers} {...props} />);
    return handlers;
};

describe('ConfirmBlock (plan.md §25.3, §25.5)', () => {
    it('the accessible label names the action and the amount', () => {
        setup();
        expect(screen.getByRole('button', { name: 'Confirm: Cancel withdrawal, ₹2,000.00' })).toBeInTheDocument();
    });

    it('confirm sends the proposal id and nonce; cancel sends the id', () => {
        const { onConfirm, onCancel } = setup();
        fireEvent.click(screen.getByRole('button', { name: /^Confirm:/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onConfirm).toHaveBeenCalledWith('pr_0123456789abcdef01234567', 'nonce-1');
        expect(onCancel).toHaveBeenCalledWith('pr_0123456789abcdef01234567');
    });

    it('renders money through Amount and the irreversible warning', () => {
        setup();
        expect(screen.getByText('2,000 rupees')).toBeInTheDocument();
        expect(screen.getByText(/can't be undone/)).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'Cancel withdrawal' })).toBeInTheDocument();
    });

    it('is disabled and says "Working…" while executing', () => {
        setup({ executing: true });
        const working = screen.getByRole('button', { name: /Working/ });
        expect(working).toBeDisabled();
        expect(working).toHaveAttribute('aria-busy', 'true');
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    });

    it('is disabled while anything else is in flight', () => {
        setup({ busy: true });
        expect(screen.getByRole('button', { name: /^Confirm:/ })).toBeDisabled();
    });

    it('uses the danger variant for HIGH risk', () => {
        setup({ block: { danger: true } });
        expect(screen.getByRole('button', { name: /^Confirm:/ }).className).toMatch(/bg-danger/);
    });

    it('uses the AI variant for non-HIGH risk', () => {
        setup();
        expect(screen.getByRole('button', { name: /^Confirm:/ }).className).toMatch(/bg-ai-soft/);
    });

    it('a card from history (no nonce) cannot be confirmed', () => {
        setup({ block: { nonce: null } });
        expect(screen.queryByRole('button', { name: /^Confirm/ })).not.toBeInTheDocument();
        expect(screen.getByText(/No longer active/)).toBeInTheDocument();
    });

    it('a card that is not the latest message cannot be confirmed', () => {
        setup({ interactive: false });
        expect(screen.queryByRole('button', { name: /^Confirm/ })).not.toBeInTheDocument();
    });

    it('takes focus when it appears live', () => {
        setup({ autoFocus: true });
        expect(screen.getByRole('group', { name: 'Cancel withdrawal' })).toHaveFocus();
    });

    it('a handoff card says what it does', () => {
        setup({ confirmLabel: 'Create ticket', block: { title: 'Create a support ticket', lines: [] } });
        expect(screen.getByRole('button', { name: 'Create ticket: Create a support ticket' })).toBeInTheDocument();
    });
});
