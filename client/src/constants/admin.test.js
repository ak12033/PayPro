import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CAPABILITIES, STAFF_ROLES, can, isStaff } from './admin';

/**
 * The console hides what a role cannot do; the server is what actually refuses
 * it. If the two tables drift, the console either shows buttons that only ever
 * 403, or — worse for operations — hides a queue from the role whose job it is.
 * So this reads the server's route file and holds the client table to it,
 * instead of trusting a copy that nobody re-checks.
 */

const ADMIN_ROUTES = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../server/routes/adminRoutes.js'
);

/** `method path` → roles, parsed from `adminRouter.<method>('<path>', requireRole(...), ...)`. */
const serverRoleTable = () => {
    const source = fs.readFileSync(ADMIN_ROUTES, 'utf8');
    const table = {};
    const pattern = /adminRouter\.(get|post|patch|put|delete)\(\s*'([^']+)'\s*,\s*requireRole\(([^)]*)\)/g;
    for (const [, method, route, roles] of source.matchAll(pattern)) {
        table[`${method.toUpperCase()} ${route}`] = roles.match(/'([a-z]+)'/g).map((r) => r.slice(1, -1)).sort();
    }
    return table;
};

/** The endpoint each client capability stands for. */
const CAPABILITY_ENDPOINT = {
    viewMetrics: 'GET /metrics',
    viewUsers: 'GET /users',
    suspendUsers: 'POST /users/:userId/suspend',
    changeRoles: 'PATCH /users/:userId/role',
    viewReconciliation: 'GET /reconciliation/report',
    repairBalances: 'POST /reconciliation/repair/:userId',
    viewWebhooks: 'GET /webhooks',
    reviewRisk: 'POST /risk/cases/:id/decision',
    workSupport: 'POST /support/tickets/:id/messages',
    viewAuditLog: 'GET /audit-logs',
    viewUserDetail: 'GET /users/:userId',
    forceLogout: 'POST /users/:userId/logout-all',
    searchTransactions: 'GET /transactions',
    viewPayments: 'GET /payments',
    resettlePayments: 'POST /payments/:orderId/resettle',
    refundPayments: 'POST /payments/:orderId/refund',
    replayWebhooks: 'POST /webhooks/:id/replay',
    adjustBalances: 'POST /adjustments',
    resetTwoFactor: 'POST /users/:userId/reset-2fa',
    escalateRisk: 'POST /risk/cases/:id/escalate',
    reviewKyc: 'POST /kyc/:id/decision',
    viewAml: 'GET /aml/alerts',
    closeAml: 'POST /aml/alerts/:id/close',
    importWatchlists: 'POST /aml/watchlists',
    reviewBankAccounts: 'POST /bank-accounts/:id/decision',
    processWithdrawals: 'POST /withdrawals/:id/paid',
};

describe('CAPABILITIES matches server/routes/adminRoutes.js', () => {
    const server = serverRoleTable();

    it('parsed the server route file (guards against a regex that silently matches nothing)', () => {
        expect(Object.keys(server).length).toBeGreaterThanOrEqual(15);
    });

    it('covers every capability', () => {
        expect(Object.keys(CAPABILITIES).sort()).toEqual(Object.keys(CAPABILITY_ENDPOINT).sort());
    });

    for (const [capability, endpoint] of Object.entries(CAPABILITY_ENDPOINT)) {
        it(`${capability} ↔ ${endpoint}`, () => {
            expect(server[endpoint], `${endpoint} not found in adminRoutes.js`).toBeDefined();
            expect([...CAPABILITIES[capability]].sort()).toEqual(server[endpoint]);
        });
    }
});

describe('separation of duties (plan.md §28.3 rule 3)', () => {
    it('support can read and reply, but never touch money, suspensions or roles', () => {
        expect(can('support', 'workSupport')).toBe(true);
        expect(can('support', 'viewUsers')).toBe(true);
        expect(can('support', 'repairBalances')).toBe(false);
        expect(can('support', 'suspendUsers')).toBe(false);
        expect(can('support', 'changeRoles')).toBe(false);
        expect(can('support', 'reviewRisk')).toBe(false);
        expect(can('support', 'searchTransactions')).toBe(true);
        expect(can('support', 'adjustBalances')).toBe(false);
        expect(can('support', 'resetTwoFactor')).toBe(false);
        expect(can('risk', 'resetTwoFactor')).toBe(false);
        expect(can('support', 'resettlePayments')).toBe(false);
        expect(can('support', 'replayWebhooks')).toBe(false);
        expect(can('support', 'forceLogout')).toBe(false);
    });

    it('risk can hold and release, but cannot change roles or repair balances', () => {
        expect(can('risk', 'reviewRisk')).toBe(true);
        expect(can('risk', 'suspendUsers')).toBe(true);
        expect(can('risk', 'changeRoles')).toBe(false);
        expect(can('risk', 'repairBalances')).toBe(false);
        expect(can('risk', 'forceLogout')).toBe(true);
        expect(can('risk', 'adjustBalances')).toBe(false);
    });

    it('only admin can move money from the console (adjust, re-settle, refund, replay, repair, withdrawals)', () => {
        for (const capability of ['adjustBalances', 'resettlePayments', 'refundPayments', 'replayWebhooks', 'repairBalances', 'processWithdrawals']) {
            expect(CAPABILITIES[capability]).toEqual(['admin']);
        }
    });

    it('only admin records identity decisions or verifies a payout destination (Phase 5)', () => {
        expect(CAPABILITIES.reviewKyc).toEqual(['admin']);
        expect(CAPABILITIES.reviewBankAccounts).toEqual(['admin']);
        expect(can('risk', 'viewAml')).toBe(true);
        expect(can('risk', 'importWatchlists')).toBe(false);
        expect(can('support', 'viewAml')).toBe(false);
    });

    it('a customer can do nothing in the console, and unknown input is refused', () => {
        for (const capability of Object.keys(CAPABILITIES)) {
            expect(can('user', capability)).toBe(false);
            expect(can(undefined, capability)).toBe(false);
        }
        expect(can('admin', 'notACapability')).toBe(false);
        expect(isStaff('user')).toBe(false);
        expect(STAFF_ROLES.every(isStaff)).toBe(true);
    });
});
