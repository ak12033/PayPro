import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Amount, { LedgerAmount } from './Amount';

describe('Amount', () => {
    it('renders a plain quantity with no sign', () => {
        render(<Amount value={500} />);
        expect(screen.getByText('500')).toBeInTheDocument();
        expect(screen.getByText(/500 rupees$/)).toBeInTheDocument();
    });

    it('prefixes an incoming amount with a plus sign and marks it received', () => {
        render(<Amount value={500} direction="in" />);
        expect(screen.getByText('+')).toBeInTheDocument();
        expect(screen.getByText(/500 rupees received/)).toBeInTheDocument();
    });

    it('prefixes an outgoing amount with a minus sign and marks it sent', () => {
        render(<Amount value={500} direction="out" />);
        expect(screen.getByText('−')).toBeInTheDocument();
        expect(screen.getByText(/500 rupees sent/)).toBeInTheDocument();
    });

    it('hides the fraction when showFraction is false', () => {
        render(<Amount value={500.5} showFraction={false} />);
        expect(screen.queryByText('.50')).not.toBeInTheDocument();
    });

    it('keeps the sign of a negative quantity — an overdrawn balance must not read as money held', () => {
        render(<Amount value={-400} />);
        expect(screen.getByText('−')).toBeInTheDocument();
        expect(screen.getByText('minus 400 rupees')).toBeInTheDocument();
    });

    it('does not double-sign a directional amount', () => {
        render(<Amount value={400} direction="out" />);
        expect(screen.getAllByText('−')).toHaveLength(1);
        expect(screen.queryByText(/minus/)).not.toBeInTheDocument();
    });

    it('renders integer paise exactly when given `minor`', () => {
        render(<Amount minor={123456} />);
        expect(screen.getByText('1,234')).toBeInTheDocument();
        expect(screen.getByText('.56')).toBeInTheDocument();
    });

    it('prefers `minor` over `value`', () => {
        render(<Amount value={999} minor={500} />);
        expect(screen.getByText('5')).toBeInTheDocument();
        expect(screen.getByText('.00')).toBeInTheDocument();
    });

    it('keeps the sign of a negative `minor` quantity', () => {
        render(<Amount minor={-40005} />);
        expect(screen.getByText('−')).toBeInTheDocument();
        expect(screen.getByText('.05')).toBeInTheDocument();
        expect(screen.getByText('minus 400.05 rupees')).toBeInTheDocument();
    });

    it('rounds a float rupee value to the nearest paisa', () => {
        // 0.1 + 0.2 === 0.30000000000000004
        render(<Amount value={0.1 + 0.2} />);
        expect(screen.getByText('.30')).toBeInTheDocument();
    });

    it('treats a non-numeric value as zero rather than rendering NaN', () => {
        render(<Amount value={undefined} />);
        expect(screen.getByText('0')).toBeInTheDocument();
    });
});

describe('LedgerAmount', () => {
    it('renders a Debit as outgoing', () => {
        render(<LedgerAmount value={100} type="Debit" />);
        expect(screen.getByText(/rupees sent/)).toBeInTheDocument();
    });

    it('renders a Credit as incoming', () => {
        render(<LedgerAmount value={100} type="Credit" />);
        expect(screen.getByText(/rupees received/)).toBeInTheDocument();
    });
});
