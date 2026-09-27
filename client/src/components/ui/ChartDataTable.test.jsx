import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ChartDataTable from './ChartDataTable';

const rows = [
    { date: '2026-09-01', moneyIn: 500, moneyOut: 200 },
    { date: '2026-09-02', moneyIn: 0, moneyOut: 150 },
];
const columns = [
    { key: 'date', header: 'Period', render: (r) => r.date },
    { key: 'in', header: 'Money in', render: (r) => `₹${r.moneyIn}` },
    { key: 'out', header: 'Money out', render: (r) => `₹${r.moneyOut}` },
];

describe('ChartDataTable (plan.md §37.2 requirement 3)', () => {
    it('is in the document even while collapsed, so a screen reader never has to find the toggle', () => {
        render(<ChartDataTable caption="Cash flow by day" rows={rows} columns={columns} />);

        const table = screen.getByRole('table', { name: 'Cash flow by day' });
        expect(within(table).getAllByRole('row')).toHaveLength(3);
        expect(table.parentElement).toHaveClass('sr-only');
    });

    it('uses the first column as each row header, so cells are announced with their period', () => {
        render(<ChartDataTable caption="Cash flow" rows={rows} columns={columns} />);
        expect(screen.getByRole('rowheader', { name: '2026-09-01' })).toBeInTheDocument();
        expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Period', 'Money in', 'Money out']);
    });

    it('reveals the same table visually from a real, state-announcing button', () => {
        render(<ChartDataTable caption="Cash flow" rows={rows} columns={columns} />);
        const toggle = screen.getByRole('button', { name: /view as table/i });
        expect(toggle).toHaveAttribute('aria-expanded', 'false');

        fireEvent.click(toggle);

        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('table').parentElement).not.toHaveClass('sr-only');
        expect(screen.getByRole('button', { name: /hide table/i })).toBeInTheDocument();
    });

    it('renders nothing for an empty series rather than an empty table', () => {
        const { container } = render(<ChartDataTable caption="Empty" rows={[]} columns={columns} />);
        expect(container).toBeEmptyDOMElement();
    });
});
