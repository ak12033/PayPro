import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import { monthBoundsIST, monthKeyIST } from '../utils/period.js';

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

describe('GET /api/transactions/statement', () => {
    it('CSV includes only the requested month\'s rows, correctly scoped to the caller', async () => {
        const alice = await signup(`stmt-a-${new mongoose.Types.ObjectId()}@example.com`);
        const bob = await signup(`stmt-b-${new mongoose.Types.ObjectId()}@example.com`);

        const month = monthKeyIST();
        const { start, end } = monthBoundsIST(month);
        const outsideMonth = new Date(start.getTime() - 10 * 24 * 60 * 60 * 1000);

        await Transaction.create({
            userId: alice.id, description: 'In month', amount: 42, type: 'Debit', category: 'Food',
            invoiceId: `T${new mongoose.Types.ObjectId()}`, postedAt: new Date(start.getTime() + 1000),
        });
        await Transaction.create({
            userId: alice.id, description: 'Outside month', amount: 99, type: 'Debit', category: 'Food',
            invoiceId: `T${new mongoose.Types.ObjectId()}`, postedAt: outsideMonth,
        });
        await Transaction.create({
            userId: bob.id, description: 'Bob row', amount: 500, type: 'Debit', category: 'Food',
            invoiceId: `T${new mongoose.Types.ObjectId()}`, postedAt: new Date(start.getTime() + 1000),
        });

        const res = await request(app)
            .get('/api/transactions/statement')
            .query({ month, format: 'csv' })
            .set(auth(alice.token));

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('text/csv');
        expect(res.text).toContain('In month');
        expect(res.text).not.toContain('Outside month');
        expect(res.text).not.toContain('Bob row');
    });

    it('escapes a formula-injection payload in a description', async () => {
        const alice = await signup(`stmt-c-${new mongoose.Types.ObjectId()}@example.com`);
        const month = monthKeyIST();
        const { start } = monthBoundsIST(month);

        await Transaction.create({
            userId: alice.id, description: '=HYPERLINK("http://evil","x")', amount: 10, type: 'Debit', category: 'Food',
            invoiceId: `T${new mongoose.Types.ObjectId()}`, postedAt: new Date(start.getTime() + 1000),
        });

        const res = await request(app)
            .get('/api/transactions/statement')
            .query({ month, format: 'csv' })
            .set(auth(alice.token));

        expect(res.text).toContain("'=HYPERLINK");
    });

    it('PDF format returns a non-empty application/pdf response', async () => {
        const alice = await signup(`stmt-d-${new mongoose.Types.ObjectId()}@example.com`);
        const month = monthKeyIST();
        const { start } = monthBoundsIST(month);

        await Transaction.create({
            userId: alice.id, description: 'Row', amount: 10, type: 'Debit', category: 'Food',
            invoiceId: `T${new mongoose.Types.ObjectId()}`, postedAt: new Date(start.getTime() + 1000),
        });

        const res = await request(app)
            .get('/api/transactions/statement')
            .query({ month, format: 'pdf' })
            .set(auth(alice.token))
            .buffer(true)
            .parse((response, callback) => {
                const chunks = [];
                response.on('data', (chunk) => chunks.push(chunk));
                response.on('end', () => callback(null, Buffer.concat(chunks)));
            });

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('application/pdf');
        expect(res.body.length).toBeGreaterThan(100);
        expect(res.body.slice(0, 4).toString()).toBe('%PDF');
    });
});
