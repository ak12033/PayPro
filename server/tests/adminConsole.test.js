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

/** The two read endpoints added for the admin console (plan.md §28.2, §7.4). */
const { buildTestApp } = await import('./helpers/app.js');

let app;
beforeAll(() => { app = buildTestApp(); });

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const staff = async (email, role) => {
    const res = await request(app).post('/api/auth/signup')
        .send({ firstName: 'Staff', email, password: 'Str0ngPass99' });
    if (role) await User.updateOne({ _id: res.body.user._id }, { $set: { role, 'totp.enabled': true } });
    return { token: res.body.accessToken, id: res.body.user._id };
};
const settle = () => new Promise((r) => setTimeout(r, 60));

describe('GET /api/admin/audit-logs', () => {
    it('is open to admin and risk, closed to support and ordinary users', async () => {
        const admin = await staff('ac-admin@example.com', 'admin');
        const risk = await staff('ac-risk@example.com', 'risk');
        const support = await staff('ac-support@example.com', 'support');
        const user = await staff('ac-user@example.com');

        expect((await request(app).get('/api/admin/audit-logs').set(auth(admin.token))).status).toBe(200);
        expect((await request(app).get('/api/admin/audit-logs').set(auth(risk.token))).status).toBe(200);
        expect((await request(app).get('/api/admin/audit-logs').set(auth(support.token))).status).toBe(403);
        expect((await request(app).get('/api/admin/audit-logs').set(auth(user.token))).status).toBe(403);
    });

    it('filters by user, outcome and an action namespace prefix', async () => {
        const admin = await staff('ac-filter-admin@example.com', 'admin');
        const target = await staff('ac-filter-target@example.com');
        await AuditLog.create([
            { userId: target.id, action: AUDIT.TRANSFER_SENT },
            { userId: target.id, action: AUDIT.TRANSFER_FAILED, outcome: 'failure' },
            { userId: target.id, action: AUDIT.LOGIN_FAILED, outcome: 'failure' },
        ]);

        const res = await request(app)
            .get(`/api/admin/audit-logs?userId=${target.id}&action=wallet.transfer&outcome=failure`)
            .set(auth(admin.token));

        expect(res.status).toBe(200);
        expect(res.body.entries.map((e) => e.action)).toEqual([AUDIT.TRANSFER_FAILED]);
        expect(res.body.entries[0].userId.email).toBe('ac-filter-target@example.com');
    });

    it('treats the action filter as a literal prefix, not a regex', async () => {
        const admin = await staff('ac-regex-admin@example.com', 'admin');
        await AuditLog.create({ action: AUDIT.LOGIN_SUCCESS });

        const res = await request(app).get('/api/admin/audit-logs?action=.*').set(auth(admin.token));
        expect(res.status).toBe(200);
        expect(res.body.entries.filter((e) => e.action === AUDIT.LOGIN_SUCCESS)).toHaveLength(0);
    });

    it('rejects a malformed user id and logs the read as a PII access', async () => {
        const admin = await staff('ac-pii-admin@example.com', 'admin');

        const bad = await request(app).get('/api/admin/audit-logs?userId=not-an-id').set(auth(admin.token));
        expect(bad.status).toBe(400);

        await request(app).get('/api/admin/audit-logs').set(auth(admin.token));
        await settle();
        const entry = await AuditLog.findOne({ action: AUDIT.ADMIN_PII_ACCESSED, 'metadata.resource': 'audit_logs' });
        expect(entry).toBeTruthy();
    });
});

describe('GET /api/admin/reconciliation/minor', () => {
    it('reports the paise columns as healthy for data written by the dual-write path', async () => {
        const admin = await staff('ac-minor-admin@example.com', 'admin');
        const res = await request(app).get('/api/admin/reconciliation/minor').set(auth(admin.token));

        expect(res.status).toBe(200);
        expect(res.body.healthy).toBe(true);
        expect(res.body.summary.usersMissingOrMismatched).toBe(0);
    });

    it('is not available to support', async () => {
        const support = await staff('ac-minor-support@example.com', 'support');
        const res = await request(app).get('/api/admin/reconciliation/minor').set(auth(support.token));
        expect(res.status).toBe(403);
    });
});
