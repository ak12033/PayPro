import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RequireRole from './RequireRole';

const auth = { user: null, isCheckingAuth: false };
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
// The real loader reads the theme; the guard's decision is what is under test.
vi.mock('./feedback/FullScreenLoader', () => ({ default: () => <p>Loading</p> }));

const renderAt = (capability) => render(
    <MemoryRouter initialEntries={['/admin/x']}>
        <Routes>
            <Route path="/home" element={<p>Home screen</p>} />
            <Route
                path="/admin/x"
                element={<RequireRole capability={capability}><p>Console section</p></RequireRole>}
            />
        </Routes>
    </MemoryRouter>
);

describe('RequireRole', () => {
    beforeEach(() => {
        auth.user = null;
        auth.isCheckingAuth = false;
    });

    it('waits for the profile instead of guessing a role', () => {
        auth.isCheckingAuth = true;
        renderAt('viewMetrics');
        expect(screen.queryByText('Console section')).not.toBeInTheDocument();
        expect(screen.queryByText('Home screen')).not.toBeInTheDocument();
    });

    it('sends a customer home without explanation', () => {
        auth.user = { role: 'user' };
        renderAt('viewMetrics');
        expect(screen.getByText('Home screen')).toBeInTheDocument();
    });

    it('explains to staff when a section needs a different role', () => {
        auth.user = { role: 'support' };
        renderAt('repairBalances');
        expect(screen.getByText('Not available to your role')).toBeInTheDocument();
        expect(screen.queryByText('Console section')).not.toBeInTheDocument();
    });

    it('renders the section for a role that has the capability', () => {
        auth.user = { role: 'risk' };
        renderAt('reviewRisk');
        expect(screen.getByText('Console section')).toBeInTheDocument();
    });
});
