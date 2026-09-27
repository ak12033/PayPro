import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import { auth, makeAccount } from './helpers/phase5.js';

vi.mock('../utils/sendOtp.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../utils/socket.js', () => ({ emitToUser: vi.fn(), getIO: vi.fn(), initSocket: vi.fn(), default: {} }));

/** Self-reported holdings and debts (plan.md §21, §22): arithmetic only, no ledger. */
const { buildTestApp } = await import('./helpers/app.js');
const { summarise } = await import('../services/portfolioService.js');

let app;
beforeAll(() => { app = buildTestApp(); });

describe('summarise (pure)', () => {
    it('adds up in paise, allocates by type, and nets liabilities and the wallet into net worth', () => {
        const s = summarise({
            holdings: [
                { assetType: 'mf', costBasisMinor: 100000, currentValueMinor: 150000, valueUpdatedAt: '2026-09-01' },
                { assetType: 'mf', costBasisMinor: 50000, currentValueMinor: 30000, valueUpdatedAt: '2026-08-01' },
                { assetType: 'gold', costBasisMinor: 20000, currentValueMinor: 20000, valueUpdatedAt: '2026-09-20' },
            ],
            liabilities: [{ outstandingMinor: 70000, emiMinor: 5000 }, { outstandingMinor: 10000, emiMinor: null }],
            walletMinor: 12345,
        });
        expect(s).toMatchObject({
            investedMinor: 170000, holdingsValueMinor: 200000, gainMinor: 30000, gainPercent: 17.65,
            liabilitiesMinor: 80000, monthlyEmiMinor: 5000, netWorthMinor: 200000 + 12345 - 80000,
        });
        expect(s.allocation).toEqual([
            { assetType: 'mf', valueMinor: 180000, value: 1800, percent: 90 },
            { assetType: 'gold', valueMinor: 20000, value: 200, percent: 10 },
        ]);
        expect(new Date(s.oldestValueAt).toISOString().slice(0, 10)).toBe('2026-08-01');
    });

    it('has no gain percentage and no allocation when nothing is tracked', () => {
        const s = summarise({ holdings: [], liabilities: [], walletMinor: 0 });
        expect(s).toMatchObject({ gainPercent: null, allocation: [], netWorthMinor: 0 });
    });
});

describe('the API', () => {
    it('creates, edits and removes holdings and debts for their owner only, and never touches the ledger', async () => {
        const user = await makeAccount(app, 'pf-owner@example.com', { balance: 250 });
        const other = await makeAccount(app, 'pf-other@example.com');

        const h = await request(app).post('/api/portfolio/holdings').set(auth(user.token))
            .send({ assetType: 'stock', name: 'Example Ltd', units: 10, costBasis: 1000, currentValue: 1250.5 });
        expect(h.status).toBe(201);
        expect(h.body.holding).toMatchObject({ costBasisMinor: 100000, currentValueMinor: 125050, gain: 250.5, gainPercent: 25.05 });

        const l = await request(app).post('/api/portfolio/liabilities').set(auth(user.token))
            .send({ kind: 'personal_loan', lender: 'Example Bank', outstanding: 800, emi: 100, interestRate: 12.5, emiDueDay: 5 });
        expect(l.status).toBe(201);

        expect((await request(app).patch(`/api/portfolio/holdings/${h.body.holding._id}`).set(auth(other.token)).send({ currentValue: 1 })).status).toBe(404);
        const edited = await request(app).patch(`/api/portfolio/holdings/${h.body.holding._id}`).set(auth(user.token)).send({ currentValue: 0 });
        expect(edited.body.holding.currentValueMinor).toBe(0);

        const summary = await request(app).get('/api/portfolio/summary').set(auth(user.token));
        expect(summary.body.summary).toMatchObject({ holdingsValueMinor: 0, liabilitiesMinor: 80000, walletMinor: 25000, netWorthMinor: 25000 - 80000 });

        await request(app).delete(`/api/portfolio/liabilities/${l.body.liability._id}`).set(auth(user.token)).expect(200);
        expect((await request(app).get('/api/portfolio/liabilities').set(auth(user.token))).body.liabilities).toEqual([]);

        expect(await Transaction.countDocuments({ userId: user.id })).toBe(0);
        expect((await User.findById(user.id).lean()).balanceMinor).toBe(25000);
    });

    it.each([
        ['an unknown asset type', { assetType: 'crypto-yolo', name: 'x', costBasis: 1, currentValue: 1 }, 'INVALID_TYPE'],
        ['a negative value', { assetType: 'mf', name: 'x', costBasis: -5, currentValue: 1 }, 'INVALID_AMOUNT'],
        ['an operator in a number', { assetType: 'mf', name: 'x', costBasis: { $gt: 0 }, currentValue: 1 }, 'INVALID_AMOUNT'],
    ])('refuses %s', async (_label, body, code) => {
        const user = await makeAccount(app, `pf-bad-${code.toLowerCase()}-${Math.random().toString(36).slice(2, 6)}@example.com`);
        const res = await request(app).post('/api/portfolio/holdings').set(auth(user.token)).send(body);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe(code);
    });
});
