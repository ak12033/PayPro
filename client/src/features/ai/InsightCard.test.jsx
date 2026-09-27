import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import InsightCard from './InsightCard';

describe('InsightCard — AI vs deterministic trust signalling (plan.md §24.4)', () => {
    it('an AI-authored insight (no source, or source:"ai") gets the AI pill and tint', () => {
        render(<InsightCard insight={{ type: 'summary', title: 'Spending summary', description: 'You spent more this month.' }} />);
        expect(screen.getByText('AI')).toBeInTheDocument();
        expect(screen.getByText('You spent more this month.')).toBeInTheDocument();
    });

    it('a deterministic insight never renders the AI pill', () => {
        render(
            <InsightCard
                insight={{
                    source: 'deterministic',
                    kind: 'CATEGORY_SPIKE',
                    title: 'Food spending is up',
                    body: 'You spent more on Food than usual.',
                }}
            />
        );
        expect(screen.queryByText('AI')).not.toBeInTheDocument();
        expect(screen.getByText('You spent more on Food than usual.')).toBeInTheDocument();
        expect(screen.getByText(/Computed from your transactions/)).toBeInTheDocument();
    });

    it('a deterministic insight reads leniently from either description/body or type/kind', () => {
        render(
            <InsightCard
                insight={{
                    source: 'deterministic',
                    kind: 'UNUSUAL_LARGE_TXN',
                    title: 'Large payment',
                    body: 'Bigger than usual.',
                }}
            />
        );
        expect(screen.getByText('Large payment')).toBeInTheDocument();
        expect(screen.getByText('Bigger than usual.')).toBeInTheDocument();
    });
});
