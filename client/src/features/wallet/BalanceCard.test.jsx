import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BalanceCard from './BalanceCard';

const renderCard = (props) => render(<MemoryRouter><BalanceCard {...props} /></MemoryRouter>);

describe('BalanceCard overdrawn state (plan.md §4.4)', () => {
    it('an ordinary balance reads as available, with Send enabled', () => {
        renderCard({ balanceMinor: 25000 });
        expect(screen.getByText('Available balance')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /send/i })).toBeEnabled();
    });

    it('a negative balance reads as an amount owed — with its sign — and explains why', () => {
        renderCard({ balanceMinor: -40000 });

        expect(screen.getByText('Amount owed')).toBeInTheDocument();
        expect(screen.getByText('minus 400 rupees')).toBeInTheDocument();
        expect(screen.getByText(/refund went through after this money had already been spent/i)).toBeInTheDocument();
    });

    it('disables Send while overdrawn and keeps Add money available', () => {
        renderCard({ balanceMinor: -100 });
        expect(screen.getByRole('button', { name: /^send$/i })).toBeDisabled();
        expect(screen.getByRole('button', { name: /add money/i })).toBeEnabled();
    });

    it('never shows the overdrawn state while the balance is still loading', () => {
        renderCard({ balanceMinor: -40000, loading: true });
        expect(screen.queryByText('Amount owed')).not.toBeInTheDocument();
    });
});
