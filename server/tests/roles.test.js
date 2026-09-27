import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import User from '../models/User.js';
import AuditLog, { AUDIT } from '../models/AuditLog.js';

vi.mock('../utils/sendOtp.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../utils/fastapiClient.js', () => ({
    categorizeTransaction: vi.fn().mockResolvedValue({ category: 'Others', icon: 'CircleDollarSign', confidence_score: 0 }),
    checkFraud: vi.fn().mockResolvedValue({ risk_score: 0, risk_level: 'low', reason: 'test' }),
    default: {},
}));
vi.mock('../utils/socket.js', () => ({
    emitToUser: vi.fn(), getIO: vi.fn(), initSocket: vi.fn(), default: {},
}));

const { buildTestApp } = await import('./helpers/app.js');

let app;
beforeAll(() => { app = buildTestApp(); });

const signup = async (email, password = 'Str0ngPass99') => {
    const res = await request(app).post('/api/auth/signup')
        .send({ firstName: email.split('@')[0], email, password });
    return { token: res.body.accessToken, id: res.body.user._id, email, password };
};

const auth = (t) => ({ Authorization: `Bearer ${t}` });

const makeAdmin = async (email) => {
    const user = await signup(email);
    await User.updateOne({ _id: user.id }, { $set: { role: 'admin', 'totp.enabled': true } });
    return user;
};

describe('admin route access matrix', () => {
    it('rejects an anonymous caller', async () => {
        const res = await request(app).get('/api/admin/metrics');
        expect(res.status).toBe(401);
    });

    it("rejects an ordinary user's role", async () => {
        const alice = await signup('roles-alice@example.com');
        const res = await request(app).get('/api/admin/metrics').set(auth(alice.token));
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('FORBIDDEN_ROLE');
    });

    it('admits an admin', async () => {
        const admin = await makeAdmin('roles-admin1@example.com');
        const res = await request(app).get('/api/admin/metrics').set(auth(admin.token));
        expect(res.status).toBe(200);
        expect(res.body.users.total).toBeGreaterThanOrEqual(1);
    });

    it('gives repairAccountBalance a real HTTP caller', async () => {
        const admin = await makeAdmin('roles-admin2@example.com');
        const alice = await signup('roles-drift@example.com');
        await User.updateOne({ _id: alice.id }, { $set: { accountBalance: 5000, balanceMinor: 500000 } }); // drifted: no ledger backs this

        const report = await request(app)
            .get(`/api/admin/reconciliation/report?userId=${alice.id}`)
            .set(auth(admin.token));
        expect(report.status).toBe(200);
        expect(report.body.healthy).toBe(false);

        const repair = await request(app)
            .post(`/api/admin/reconciliation/repair/${alice.id}`)
            .set(auth(admin.token))
            .send({ reason: 'test repair' });

        expect(repair.status).toBe(200);
        expect(repair.body.repaired).toBe(true);
        expect((await User.findById(alice.id)).accountBalance).toBe(0);

        await new Promise((r) => setTimeout(r, 50));
        const entry = await AuditLog.findOne({ action: AUDIT.ADMIN_RECONCILIATION_REPAIR });
        expect(entry).toBeTruthy();
        expect(entry.target.id).toBe(String(alice.id));
    });

    it('a support role can read but not repair', async () => {
        const support = await signup('roles-support@example.com');
        await User.updateOne({ _id: support.id }, { $set: { role: 'support', 'totp.enabled': true } });
        const alice = await signup('roles-support-target@example.com');

        const readRes = await request(app).get('/api/admin/users').set(auth(support.token));
        expect(readRes.status).toBe(200);

        const repairRes = await request(app)
            .post(`/api/admin/reconciliation/repair/${alice.id}`)
            .set(auth(support.token));
        expect(repairRes.status).toBe(403);
    });
});

describe('role changes require re-authentication', () => {
    it('refuses without the current password', async () => {
        const admin = await makeAdmin('roles-reauth-admin@example.com');
        const alice = await signup('roles-reauth-target@example.com');

        const res = await request(app)
            .patch(`/api/admin/users/${alice.id}/role`)
            .set(auth(admin.token))
            .send({ role: 'support' });

        expect(res.status).toBe(400);
        expect((await User.findById(alice.id)).role).toBe('user');
    });

    it('grants a role with the correct password and audits it', async () => {
        const admin = await makeAdmin('roles-grant-admin@example.com');
        const alice = await signup('roles-grant-target@example.com');

        const res = await request(app)
            .patch(`/api/admin/users/${alice.id}/role`)
            .set(auth(admin.token))
            .send({ role: 'support', currentPassword: 'Str0ngPass99' });

        expect(res.status).toBe(200);
        expect((await User.findById(alice.id)).role).toBe('support');

        await new Promise((r) => setTimeout(r, 50));
        expect(await AuditLog.findOne({ action: AUDIT.ADMIN_ROLE_CHANGED })).toBeTruthy();
    });
});

describe('suspension takes effect immediately, not after the access token expires', () => {
    it('blocks a suspended user on the very next request with the same still-valid token', async () => {
        const admin = await makeAdmin('roles-suspend-admin@example.com');
        const alice = await signup('roles-suspend-target@example.com');

        // Sanity: the token works before suspension.
        const before = await request(app).get('/api/users/profile').set(auth(alice.token));
        expect(before.status).toBe(200);

        const suspend = await request(app)
            .post(`/api/admin/users/${alice.id}/suspend`)
            .set(auth(admin.token))
            .send({ currentPassword: 'Str0ngPass99' });
        expect(suspend.status).toBe(200);

        // Same access token, not re-minted, not expired — suspension is read
        // from the database on every request, not cached in the JWT.
        const after = await request(app).get('/api/users/profile').set(auth(alice.token));
        expect(after.status).toBe(403);
        expect(after.body.code).toBe('ACCOUNT_SUSPENDED');
    });

    it('reactivation restores access', async () => {
        const admin = await makeAdmin('roles-reactivate-admin@example.com');
        const alice = await signup('roles-reactivate-target@example.com');

        await request(app).post(`/api/admin/users/${alice.id}/suspend`)
            .set(auth(admin.token)).send({ currentPassword: 'Str0ngPass99' });
        await request(app).post(`/api/admin/users/${alice.id}/reactivate`)
            .set(auth(admin.token)).send({ currentPassword: 'Str0ngPass99' });

        const res = await request(app).get('/api/users/profile').set(auth(alice.token));
        expect(res.status).toBe(200);
    });
});
