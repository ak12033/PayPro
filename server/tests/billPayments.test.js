import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Bill from '../models/Bill.js';
import { auth, makeAccount } from './helpers/phase5.js';

vi.mock('../utils/sendOtp.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../utils/fastapiClient.js', () => ({
    categorizeTransaction: vi.fn().mockResolvedValue({ category: 'Others', icon: 'CircleDollarSign', confidence_score: 0 }),
    checkFraud: vi.fn().mockResolvedValue({ risk_score: 0, risk_level: 'low', reason: 'test' }),
    default: {},
}));
vi.mock('../utils/socket.js', () => ({ emitToUser: vi.fn(), getIO: vi.fn(), initSocket: vi.fn(), default: {} }));

/**
 * Bill payment through the provider adapter (plan.md §19.3). The real rail
 * (BBPS) is external and absent; these tests pin the two things that must hold
 * without it: with no provider nothing is debited, and the demo provider moves
 * money through the same hold → settle / return path as a withdrawal.
 */
const { buildTestApp } = await import('./helpers/app.js');
const { reconcileBalances } = await import('../services/reconciliationService.js');
const { creditFromPayment } = await import('../services/ledgerService.js');
const { setBillProviderForTests, DemoBillProvider } = await import('../services/providers/billProvider.js');

let app;
beforeAll(() => { app = buildTestApp(); });
afterEach(() => setBillProviderForTests(null));

const funded = async (email, amount = 5000) => {
    const user = await makeAccount(app, email);
    await creditFromPayment({ userId: user.id, amount, description: 'Seed', paymentRef: `seed-${email}` });
    return user;
};
const pay = (user, body) => request(app).post('/api/bill-payments/pay').set(auth(user.token)).send(body);

describe('with no provider configured (the default)', () => {
    it('reports itself unavailable and debits nothing', async () => {
        const user = await funded('bp-none@example.com');
        expect((await request(app).get('/api/bill-payments/status').set(auth(user.token))).body).toEqual({ enabled: false, mode: 'unconfigured' });
        const res = await pay(user, { billerId: 'demo-power', customerRef: '12345678' });
        expect(res.status).toBe(503);
        expect(res.body.code).toBe('BILL_PAYMENTS_UNAVAILABLE');
        expect((await User.findById(user.id).lean()).balanceMinor).toBe(500000);
    });
});

describe('with the demo provider', () => {
    it('pays the biller\'s amount (not the browser\'s), settles the row, marks the reminder paid, and reconciles', async () => {
        setBillProviderForTests(new DemoBillProvider());
        const user = await funded('bp-demo@example.com');
        const fetched = await request(app).post('/api/bill-payments/fetch').set(auth(user.token)).send({ billerId: 'demo-power', customerRef: '12345678' });
        expect(fetched.body.mode).toBe('demo');
        const { amountMinor } = fetched.body.bill;

        const reminder = await Bill.create({ userId: user.id, billerName: 'Power', dueDate: new Date(Date.now() + 864e5), frequency: 'once' });
        const res = await pay(user, { billerId: 'demo-power', customerRef: '12345678', billId: String(reminder._id), amount: 1 });
        expect(res.status).toBe(201);
        expect(res.body.status).toBe('SUCCESS');

        const row = await Transaction.findById(res.body.transaction._id).lean();
        expect(row).toMatchObject({ source: 'bill', status: 'SUCCESS', amountMinor, category: 'Bills' });
        expect(row.description).toMatch(/^\[Demo\]/);
        expect((await User.findById(user.id).lean()).balanceMinor).toBe(500000 - amountMinor);
        expect((await Bill.findById(reminder._id).lean())).toMatchObject({ status: 'paid' });
        expect(await reconcileBalances({ userId: user.id })).toEqual([]);
    });

    it('a declined payment returns the money and leaves a FAILED row', async () => {
        setBillProviderForTests(new DemoBillProvider());
        const user = await funded('bp-declined@example.com');
        const res = await pay(user, { billerId: 'demo-water', customerRef: '12340000' });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('FAILED');
        expect((await User.findById(user.id).lean()).balanceMinor).toBe(500000);
        expect((await Transaction.findById(res.body.transaction._id).lean()).status).toBe('FAILED');
        expect(await reconcileBalances({ userId: user.id })).toEqual([]);
    });

    it('a provider that throws mid-payment fails closed: money returned', async () => {
        const broken = new DemoBillProvider();
        broken.payBill = async () => { throw new Error('socket hang up'); };
        setBillProviderForTests(broken);
        const user = await funded('bp-broken@example.com');
        const res = await pay(user, { billerId: 'demo-gas', customerRef: '12345678' });
        expect(res.body.status).toBe('FAILED');
        expect((await User.findById(user.id).lean()).balanceMinor).toBe(500000);
        expect(await reconcileBalances({ userId: user.id })).toEqual([]);
    });

    it('cannot pay more than the balance', async () => {
        setBillProviderForTests(new DemoBillProvider());
        const user = await funded('bp-poor@example.com', 10);
        const res = await pay(user, { billerId: 'demo-power', customerRef: '12345678' });
        expect(res.body.code).toBe('INSUFFICIENT_FUNDS');
    });
});

describe('the reminder tracker stays unable to move money (context.md §5.14)', () => {
    it('billService imports nothing that can mutate a balance', () => {
        const source = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../services/billService.js'), 'utf8');
        const imports = source.split(/\r?\n/).filter((line) => /^import\b/.test(line)).join('\n');
        expect(imports).not.toMatch(/ledgerService|billPaymentService|providers\/billProvider/);
        expect(imports).toMatch(/models\/Bill\.js/); // the scan really read the imports
    });
});

describe('production refuses the demo biller', () => {
    it('validateConfig exits when ENABLE_DEMO_BILL_PAYMENTS=true in production', () => {
        const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
        const result = spawnSync(process.execPath, ['-e', "import('./config/env.js').then((m) => m.validateConfig())"], {
            cwd: serverRoot,
            env: {
                PATH: process.env.PATH,
                SystemRoot: process.env.SystemRoot,
                DOTENV_CONFIG_PATH: path.join(serverRoot, 'tests', 'no-such.env'),
                NODE_ENV: 'production',
                ENABLE_DEMO_BILL_PAYMENTS: 'true',
                JWT_SECRET: 'x'.repeat(40),
                MONGO_URI: 'mongodb://localhost/none',
                CORS_ORIGIN: 'https://example.com',
                RAZORPAY_KEY_ID: 'k', RAZORPAY_KEY_SECRET: 's', RAZORPAY_WEBHOOK_SECRET: 'w',
                TOTP_ENCRYPTION_KEY: 'a'.repeat(64),
                PII_ENCRYPTION_KEY: 'b'.repeat(64),
            },
            encoding: 'utf8',
        });
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/ENABLE_DEMO_BILL_PAYMENTS/);
    });
});
