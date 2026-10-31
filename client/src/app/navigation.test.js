import { describe, it, expect } from 'vitest';
import { adminNavFor, isAdminNavItemActive, isNavItemActive, primaryNavFor, ADMIN_NAV, PRIMARY_NAV } from './navigation';
import { ROUTES, WALLET_ROUTES } from '../constants/routes';

const labels = (role) => adminNavFor(role).map((item) => item.label);

describe('adminNavFor', () => {
    it('gives a customer no console at all', () => {
        expect(adminNavFor('user')).toEqual([]);
        expect(adminNavFor(undefined)).toEqual([]);
    });

    it('gives an admin every section', () => {
        expect(adminNavFor('admin')).toHaveLength(ADMIN_NAV.length);
    });

    it('shows support only the sections support can use', () => {
        expect(labels('support')).toEqual(['Overview', 'Support', 'Users', 'Transactions', 'Payments', 'Webhooks']);
    });

    it('shows risk only the sections risk can use', () => {
        // AML alerts (Phase 5) are risk's work too; identity checks and withdrawals are not.
        expect(labels('risk')).toEqual(['Overview', 'Risk queue', 'AML alerts', 'Users', 'Transactions', 'Payments', 'Reconciliation', 'Audit log']);
    });

    it('shows admin the Phase 5 queues next to the other queues', () => {
        expect(labels('admin').slice(0, 6)).toEqual(['Overview', 'Risk queue', 'Support', 'Withdrawals', 'Identity checks', 'AML alerts']);
    });
});

describe('active-state matching', () => {
    const overview = ADMIN_NAV.find((item) => item.to === ROUTES.ADMIN);
    const risk = ADMIN_NAV.find((item) => item.to === ROUTES.ADMIN_RISK);

    it('lights Overview only on /admin itself, not on every console page', () => {
        expect(isAdminNavItemActive(overview, '/admin')).toBe(true);
        expect(isAdminNavItemActive(overview, '/admin/risk')).toBe(false);
    });

    it('lights a section on its own path', () => {
        expect(isAdminNavItemActive(risk, '/admin/risk')).toBe(true);
        expect(isAdminNavItemActive(risk, '/admin/riskier')).toBe(false);
    });

    it('keeps the Account tab lit inside the console, which is entered from Account on mobile', () => {
        const account = PRIMARY_NAV.find((item) => item.label === 'Account');
        expect(isNavItemActive(account, '/admin/support')).toBe(true);
    });

    it('the primary tab bar is still exactly four destinations', () => {
        expect(PRIMARY_NAV).toHaveLength(4);
    });
});

describe('consumer-wallet freeze (DEC-02, AC0-07)', () => {
    it('offers only Account when the wallet is off', () => {
        expect(primaryNavFor(false).map((item) => item.label)).toEqual(['Account']);
    });

    it('offers all four destinations when it is on', () => {
        expect(primaryNavFor(true).map((item) => item.label)).toEqual(['Home', 'Money', 'Activity', 'Account']);
    });

    it('lists every wallet screen as a wallet route, and never Account, Security or Support', () => {
        for (const path of [ROUTES.HOME, ROUTES.SEND, ROUTES.ADD_MONEY, ROUTES.WITHDRAW, ROUTES.ACTIVITY, ROUTES.INSIGHTS, ROUTES.BILLS, ROUTES.VERIFICATION]) {
            expect(WALLET_ROUTES).toContain(path);
        }
        for (const path of [ROUTES.ACCOUNT, ROUTES.SECURITY, ROUTES.SUPPORT, ROUTES.ADMIN]) {
            expect(WALLET_ROUTES).not.toContain(path);
        }
    });
});
