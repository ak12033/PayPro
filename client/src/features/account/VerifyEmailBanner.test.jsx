import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import VerifyEmailBanner from './VerifyEmailBanner';

const auth = { user: null, setUser: vi.fn() };
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../services/api/endpoints/authApi', () => ({ authApi: {} }));

describe('VerifyEmailBanner (plan.md §31.2.7)', () => {
    beforeEach(() => { auth.user = null; });

    it('stays hidden while the profile is still loading', () => {
        auth.user = { email: 'a@example.com' }; // emailVerified not known yet
        const { container } = render(<VerifyEmailBanner />);
        expect(container).toBeEmptyDOMElement();
    });

    it('stays hidden for a verified account', () => {
        auth.user = { email: 'a@example.com', emailVerified: true };
        const { container } = render(<VerifyEmailBanner />);
        expect(container).toBeEmptyDOMElement();
    });

    it('says what is blocked, and what is not, for an unverified account', () => {
        auth.user = { email: 'a@example.com', emailVerified: false };
        render(<VerifyEmailBanner />);
        expect(screen.getByText(/can't send or add money until a@example.com is confirmed/i)).toBeInTheDocument();
        expect(screen.getByText(/receiving money and everything else works/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Enter code' })).toBeInTheDocument();
    });
});
