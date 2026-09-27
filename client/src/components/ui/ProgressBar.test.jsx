import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProgressBar from './ProgressBar';

describe('ProgressBar', () => {
    it('exposes the accessible progressbar contract', () => {
        render(<ProgressBar value={5000} max={10000} label="Food budget" />);
        const bar = screen.getByRole('progressbar');
        expect(bar).toHaveAttribute('aria-valuenow', '5000');
        expect(bar).toHaveAttribute('aria-valuemin', '0');
        expect(bar).toHaveAttribute('aria-valuemax', '10000');
        expect(bar).toHaveAttribute('aria-label', 'Food budget');
    });

    it('defaults to the positive tone at or under 50%', () => {
        render(<ProgressBar value={4000} max={10000} label="x" />);
        const fill = screen.getByRole('progressbar').firstChild;
        expect(fill.className).toContain('bg-positive');
    });

    it('defaults to the warning tone between 81% and 100%', () => {
        render(<ProgressBar value={9000} max={10000} label="x" />);
        const fill = screen.getByRole('progressbar').firstChild;
        expect(fill.className).toContain('bg-warning');
    });

    it('renders a distinct negative overflow segment when over 100%', () => {
        render(<ProgressBar value={12000} max={10000} label="x" />);
        const bar = screen.getByRole('progressbar');
        expect(bar.querySelectorAll('.bg-negative').length).toBeGreaterThan(0);
    });

    it('an explicit tone overrides the percent-derived default', () => {
        render(<ProgressBar value={1000} max={10000} tone="warning" label="x" />);
        const fill = screen.getByRole('progressbar').firstChild;
        expect(fill.className).toContain('bg-warning');
    });
});
