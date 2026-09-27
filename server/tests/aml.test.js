import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import AmlAlert from '../models/AmlAlert.js';
import Watchlist from '../models/Watchlist.js';
import Transaction from '../models/Transaction.js';
import { auth, makeAccount, settle } from './helpers/phase5.js';
import { generateInvoiceId } from '../utils/generateInvoiceId.js';

vi.mock('../utils/sendOtp.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../utils/fastapiClient.js', () => ({
    categorizeTransaction: vi.fn().mockResolvedValue({ category: 'Others', icon: 'CircleDollarSign', confidence_score: 0 }),
    checkFraud: vi.fn().mockResolvedValue({ risk_score: 0, risk_level: 'low', reason: 'test' }),
    default: {},
}));
vi.mock('../utils/socket.js', () => ({ emitToUser: vi.fn(), getIO: vi.fn(), initSocket: vi.fn(), default: {} }));

/**
 * AML monitoring in shadow mode (plan.md §30.3, §0.20.3): rules flag and log to
 * a review queue and never block.
 */
const { buildTestApp } = await import('./helpers/app.js');
const aml = await import('../services/amlService.js');
const { securityConfig } = await import('../config/security.js');

let app;
beforeAll(() => { app = buildTestApp(); });

const cfg = securityConfig.aml;
const noSignals = () => ({
    movements: [], outboundCount: 0, outboundMinor: 0, inboundTransferMinor: 0, distinctSenders: 0, distinctRecipients: 0,
    rapid: { inflowMinor: 0, outflowMinor: 0, firstInflowAt: null, lastOutflowAt: null, transactionIds: [] },
});
const rules = (signals) => aml.evaluateAml({ ...noSignals(), ...signals }, cfg).map((h) => h.rule);

describe('evaluateAml (pure)', () => {
    it('fires nothing on ordinary activity', () => {
        expect(rules({ movements: [{ id: 'a', amountMinor: 50000 }], outboundCount: 1, outboundMinor: 50000 })).toEqual([]);
    });

    it('STRUCTURING: three movements just under the threshold, not two, and not ones at or over it', () => {
        const just = cfg.structuring.thresholdMinor - 100;
        expect(rules({ movements: [1, 2, 3].map((id) => ({ id, amountMinor: just })) })).toContain('STRUCTURING');
        expect(rules({ movements: [1, 2].map((id) => ({ id, amountMinor: just })) })).not.toContain('STRUCTURING');
        expect(rules({ movements: [1, 2, 3].map((id) => ({ id, amountMinor: cfg.structuring.thresholdMinor })) })).not.toContain('STRUCTURING');
    });

    it('RAPID_IN_OUT: most of a large inflow leaving afterwards, inside the window', () => {
        const t0 = new Date('2026-09-27T10:00:00Z');
        const t1 = new Date('2026-09-27T10:20:00Z');
        const base = { inflowMinor: 2_000_000, firstInflowAt: t0, transactionIds: [] };
        expect(rules({ rapid: { ...base, outflowMinor: 1_900_000, lastOutflowAt: t1 } })).toContain('RAPID_IN_OUT');
        expect(rules({ rapid: { ...base, outflowMinor: 1_000_000, lastOutflowAt: t1 } })).not.toContain('RAPID_IN_OUT');
        // Money out *before* it came in is not in-and-out.
        expect(rules({ rapid: { ...base, outflowMinor: 1_900_000, lastOutflowAt: new Date('2026-09-27T09:00:00Z') } })).not.toContain('RAPID_IN_OUT');
        expect(rules({ rapid: { ...base, inflowMinor: 100_000, outflowMinor: 100_000, lastOutflowAt: t1 } })).not.toContain('RAPID_IN_OUT');
    });

    it('FAN_IN, FAN_OUT and HIGH_VELOCITY at their thresholds', () => {
        expect(rules({ distinctSenders: cfg.fanIn.minCounterparties })).toEqual(['FAN_IN']);
        expect(rules({ distinctRecipients: cfg.fanOut.minCounterparties })).toEqual(['FAN_OUT']);
        expect(rules({ outboundCount: cfg.velocity.maxCount })).toEqual(['HIGH_VELOCITY']);
        expect(rules({ outboundMinor: cfg.velocity.maxVolumeMinor })).toEqual(['HIGH_VELOCITY']);
    });
});

describe('names and lists', () => {
    it('normalises order, case, punctuation and accents', () => {
        expect(aml.nameKey('VERMA, Asha  Rani')).toBe(aml.nameKey('asha rani verma'));
        expect(aml.nameKey('José Álvarez')).toBe('alvarez jose');
    });

    it('lets a candidate with a middle name match a shorter list entry, never the reverse', () => {
        expect(aml.candidateKeys('John Michael Smith')).toContain(aml.nameKey('John Smith'));
        expect(aml.candidateKeys('John Smith')).not.toContain(aml.nameKey('John Michael Smith'));
    });

    it('parses quoted CSV with commas and doubled quotes', () => {
        expect(aml.parseCsv('name,ref\n"Smith, ""JJ"" John",A1\r\nDoe Jane,B2\n')).toEqual([
            ['name', 'ref'], ['Smith, "JJ" John', 'A1'], ['Doe Jane', 'B2'],
        ]);
    });
});

describe('watchlist import (admin only)', () => {
    it('versions a list, deactivating the previous version but keeping it', async () => {
        const admin = await makeAccount(app, 'aml-import@example.com', { role: 'admin' });
        const post = (csv) => request(app).post('/api/admin/aml/watchlists?name=Designated&source=Official%20gazette')
            .set(auth(admin.token)).set('Content-Type', 'text/csv').send(csv);

        const v1 = await post('name,reference\nAlpha One,R1\n,empty row\n');
        expect(v1.status).toBe(201);
        expect(v1.body).toMatchObject({ entries: 1, skipped: 1 });
        const v2 = await post('name\nAlpha One\nBeta Two\n');
        expect(v2.body.watchlist).toMatchObject({ version: 2, active: true });

        const lists = await Watchlist.find({ name: 'Designated' }).sort({ version: 1 }).lean();
        expect(lists.map((l) => [l.version, l.active])).toEqual([[1, false], [2, true]]);

        expect((await post('reference\nR1\n')).body.code).toBe('NO_NAME_COLUMN');
    });

    it('is refused to risk, who can still read alerts', async () => {
        const risk = await makeAccount(app, 'aml-risk@example.com', { role: 'risk' });
        const res = await request(app).post('/api/admin/aml/watchlists?name=X&source=Y').set(auth(risk.token)).set('Content-Type', 'text/csv').send('name\nA B\n');
        expect(res.status).toBe(403);
        expect((await request(app).get('/api/admin/aml/alerts').set(auth(risk.token))).status).toBe(200);
    });
});

describe('shadow mode: flags, never blocks', () => {
    it('every fan-out transfer settles, and one FAN_OUT alert is raised for the day', async () => {
        const sender = await makeAccount(app, 'aml-fan@example.com', { balance: 10000 });
        await Transaction.create({ userId: sender.id, invoiceId: generateInvoiceId(), description: 'seed', amount: 10000, type: 'Credit', category: 'Top Up', source: 'topup' });
        const recipients = [];
        for (let i = 0; i < cfg.fanOut.minCounterparties; i += 1) recipients.push(await makeAccount(app, `aml-fan-r${i}@example.com`));

        for (const r of recipients) {
            const res = await request(app).post('/api/transactions/transfer').set(auth(sender.token)).send({ recipientId: r.id, amount: 10 });
            expect(res.status).toBe(200);
        }
        await settle(300);

        const alerts = await AmlAlert.find({ userId: sender.id, rule: 'FAN_OUT' }).lean();
        expect(alerts).toHaveLength(1);
        expect(alerts[0]).toMatchObject({ mode: 'shadow', status: 'open' });
    });

    it('closing an alert is compare-and-set, and a suspicious disposition needs a report draft', async () => {
        const reviewer = await makeAccount(app, 'aml-close@example.com', { role: 'risk' });
        const subject = await makeAccount(app, 'aml-close-subject@example.com');
        const alert = await AmlAlert.create({ userId: subject.id, rule: 'STRUCTURING', detail: 'test', dedupeKey: 'STRUCTURING:test' });
        const close = (body) => request(app).post(`/api/admin/aml/alerts/${alert._id}/close`).set(auth(reviewer.token)).send(body);

        expect((await close({ disposition: 'suspicious', notes: 'Three ₹49,000 top-ups in an hour' })).body.code).toBe('DRAFT_REQUIRED');
        const ok = await close({ disposition: 'suspicious', notes: 'Three ₹49,000 top-ups in an hour', reportDraft: 'Customer structured deposits below threshold on 27 Sep.' });
        expect(ok.status).toBe(200);
        expect(ok.body.alert).toMatchObject({ status: 'closed', disposition: 'suspicious' });
        expect((await close({ disposition: 'no_action', notes: 'second reviewer' })).status).toBe(409);
    });
});
