import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Session from '../models/Session.js';
import Transaction from '../models/Transaction.js';
import { closeAccount, exportUserData } from '../services/accountClosureService.js';

vi.mock('../utils/sendOtp.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../utils/fastapiClient.js', () => ({
    categorizeTransaction: vi.fn().mockResolvedValue({ category: 'Others', icon: 'CircleDollarSign', confidence_score: 0 }),
    checkFraud: vi.fn().mockResolvedValue({ risk_score: 0, risk_level: 'low', reason: 'test' }),
    default: {},
}));
vi.mock('../utils/socket.js', () => ({ emitToUser: vi.fn(), getIO: vi.fn(), initSocket: vi.fn(), default: {} }));
vi.mock('../utils/fcm.js', () => ({ sendPushNotification: vi.fn().mockResolvedValue({ success: true, failedTokens: [] }), default: {} }));

const { buildTestApp } = await import('./helpers/app.js');

let app;
beforeAll(() => { app = buildTestApp(); });

const signup = async (email) => {
    const res = await request(app).post('/api/auth/signup')
        .send({ firstName: email.split('@')[0], email, password: 'Str0ngPass99' });
    return { token: res.body.accessToken, id: res.body.user._id };
};
const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe('accountClosureService.closeAccount', () => {
    it('revokes every session and pseudonymises identity while leaving financial data untouched', async () => {
        const alice = await signup(`close-${new mongoose.Types.ObjectId()}@example.com`);
        await Session.create({
            userId: alice.id, refreshTokenHash: 'x'.repeat(64), familyId: 'fam1',
            expiresAt: new Date(Date.now() + 1000000),
        });
        await Transaction.create({
            userId: alice.id, description: 'kept', amount: 10, type: 'Debit', category: 'Food',
            invoiceId: `T${new mongoose.Types.ObjectId()}`,
        });

        await closeAccount(alice.id);

        const user = await User.findById(alice.id);
        expect(user.status).toBe('closed');
        expect(user.firstName).toBe('Deleted');
        expect(user.email).toContain('closed+');
        expect(user.email).toContain('@deleted.local');

        expect(await Session.countDocuments({ userId: alice.id })).toBe(0);
        expect(await Transaction.countDocuments({ userId: alice.id })).toBe(1); // retained
    });

    it('a closed account\'s pre-closure access token is rejected on its very next request', async () => {
        const alice = await signup(`close2-${new mongoose.Types.ObjectId()}@example.com`);
        await closeAccount(alice.id);

        // `closeAccount` bumps `tokenVersion` (same as a password change), so
        // the pre-closure token is revoked outright rather than merely
        // 403'd by the status check — a stronger guarantee than suspension's.
        const res = await request(app).get('/api/users/profile').set(auth(alice.token));
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('TOKEN_REVOKED');
    });

    it('the ACCOUNT_CLOSED status check itself fires for a token whose version still matches', async () => {
        const alice = await signup(`close3-${new mongoose.Types.ObjectId()}@example.com`);
        // Simulate closure without the tokenVersion bump this once, to
        // exercise the `authMiddleware` status branch in isolation.
        await User.updateOne({ _id: alice.id }, { $set: { status: 'closed' } });

        const res = await request(app).get('/api/users/profile').set(auth(alice.token));
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('ACCOUNT_CLOSED');
    });
});

describe('accountClosureService.exportUserData', () => {
    it('includes the user\'s own financial data and never the password hash', async () => {
        const alice = await signup(`export-${new mongoose.Types.ObjectId()}@example.com`);
        await Transaction.create({
            userId: alice.id, description: 'row', amount: 10, type: 'Debit', category: 'Food',
            invoiceId: `T${new mongoose.Types.ObjectId()}`,
        });

        const bundle = await exportUserData(alice.id);

        expect(bundle.profile.password).toBeUndefined();
        expect(bundle.transactions).toHaveLength(1);
        expect(Array.isArray(bundle.budgets)).toBe(true);
        expect(Array.isArray(bundle.goals)).toBe(true);
    });
});
