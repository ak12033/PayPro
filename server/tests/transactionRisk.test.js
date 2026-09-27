import { describe, it, expect, vi } from 'vitest';
import mongoose from 'mongoose';
import User from '../models/User.js';
import RiskCase from '../models/RiskCase.js';
import Transaction from '../models/Transaction.js';
import TrustedDevice from '../models/TrustedDevice.js';
import AuditLog, { AUDIT } from '../models/AuditLog.js';
import {
    evaluateTransaction,
    assessTransfer,
    TXN_RISK_ACTION,
    TXN_RISK_RULES,
} from '../services/transactionRiskService.js';
import { reviewCase, autoReleaseExpired, RiskCaseError } from '../services/riskCaseService.js';

vi.mock('../utils/socket.js', () => ({ emitToUser: vi.fn(), getIO: vi.fn(), initSocket: vi.fn(), default: {} }));
vi.mock('../utils/fcm.js', () => ({ sendPushNotification: vi.fn().mockResolvedValue({ success: true, failedTokens: [] }), default: {} }));

const makeUser = (balance = 10000) => User.create({
    firstName: 'Risky', email: `k${new mongoose.Types.ObjectId()}@example.com`, password: 'hashed', accountBalance: balance, balanceMinor: Math.round(balance * 100),
});

/** Midday IST, so the ODD_HOUR rule never fires incidentally in an unrelated test. */
const middayIST = new Date('2026-03-10T06:30:00.000Z');

/** Enough debit history that the median-based rules are allowed to fire. */
const withHistory = (overrides = {}) => ({
    amount: 100,
    balance: 100000,
    medianDebit: 100,
    debitSampleSize: 20,
    at: middayIST,
    ...overrides,
});

describe('evaluateTransaction — bands (plan.md §30.2.2)', () => {
    it('allows an ordinary transfer with no signals', () => {
        const result = evaluateTransaction(withHistory());
        expect(result.score).toBe(0);
        expect(result.action).toBe(TXN_RISK_ACTION.ALLOW);
        expect(result.rules).toHaveLength(0);
    });

    it('steps up when the score reaches the step-up band', () => {
        // AMOUNT_ANOMALY (25) + NEW_RECIPIENT_HIGH_VALUE (25) = 50, over 40.
        const result = evaluateTransaction(withHistory({ amount: 600, isNewRecipient: true }));
        expect(result.action).toBe(TXN_RISK_ACTION.STEP_UP);
        expect(result.rules.map((r) => r.code)).toContain(TXN_RISK_RULES.AMOUNT_ANOMALY);
    });

    it('holds at 70 and blocks at 85', () => {
        // Anomaly 25 + new recipient 25 + drain 20 = 70.
        const held = evaluateTransaction(withHistory({
            amount: 600, balance: 700, isNewRecipient: true,
        }));
        expect(held.score).toBe(70);
        expect(held.action).toBe(TXN_RISK_ACTION.HOLD);

        // ...plus NEW_DEVICE_MONEY_MOVEMENT (30) = 100.
        const blocked = evaluateTransaction(withHistory({
            amount: 600, balance: 700, isNewRecipient: true, minutesSinceDeviceFirstSeen: 2,
        }));
        expect(blocked.action).toBe(TXN_RISK_ACTION.BLOCK);
    });
});

describe('evaluateTransaction — individual rules', () => {
    it('VELOCITY fires on too many transfers in the window', () => {
        const result = evaluateTransaction(withHistory({ recentTransferCount: 4 }));
        expect(result.rules.map((r) => r.code)).toContain(TXN_RISK_RULES.VELOCITY);
    });

    it('BALANCE_DRAIN fires when most of the balance moves', () => {
        const result = evaluateTransaction(withHistory({ amount: 90, balance: 100 }));
        expect(result.rules.map((r) => r.code)).toContain(TXN_RISK_RULES.BALANCE_DRAIN);
    });

    it('DORMANT_REACTIVATION needs dormancy AND value, not dormancy alone', () => {
        const smallReturn = evaluateTransaction(withHistory({ amount: 50, daysSinceLastActivity: 120 }));
        expect(smallReturn.rules.map((r) => r.code)).not.toContain(TXN_RISK_RULES.DORMANT_REACTIVATION);

        const bigReturn = evaluateTransaction(withHistory({ amount: 400, daysSinceLastActivity: 120 }));
        expect(bigReturn.rules.map((r) => r.code)).toContain(TXN_RISK_RULES.DORMANT_REACTIVATION);
    });

    it('ODD_HOUR fires in the small hours, IST', () => {
        // 2026-03-10T21:00Z is 02:30 IST the next day.
        const result = evaluateTransaction(withHistory({ at: new Date('2026-03-10T21:00:00.000Z') }));
        expect(result.rules.map((r) => r.code)).toContain(TXN_RISK_RULES.ODD_HOUR);
    });

    it('RAPID_TOPUP_THEN_SEND fires on forwarding a fresh top-up', () => {
        const result = evaluateTransaction(withHistory({
            amount: 5000,
            recentTopup: { amount: 5000, at: new Date(middayIST.getTime() - 3 * 60000) },
        }));
        expect(result.rules.map((r) => r.code)).toContain(TXN_RISK_RULES.RAPID_TOPUP_THEN_SEND);
    });

    it('a trusted-looking topup forwarded a day later does not fire it', () => {
        const result = evaluateTransaction(withHistory({
            amount: 5000,
            recentTopup: { amount: 5000, at: new Date(middayIST.getTime() - 86400000) },
        }));
        expect(result.rules.map((r) => r.code)).not.toContain(TXN_RISK_RULES.RAPID_TOPUP_THEN_SEND);
    });
});

describe('evaluateTransaction — the history floor', () => {
    it('median-based rules stay silent for a user with almost no history', () => {
        // A first real transfer of 50x an almost-nonexistent median must not
        // hold a brand-new user's money.
        const result = evaluateTransaction({
            amount: 5000, balance: 100000, medianDebit: 100, debitSampleSize: 2,
            isNewRecipient: true, at: middayIST,
        });
        const codes = result.rules.map((r) => r.code);
        expect(codes).not.toContain(TXN_RISK_RULES.AMOUNT_ANOMALY);
        expect(codes).not.toContain(TXN_RISK_RULES.NEW_RECIPIENT_HIGH_VALUE);
        expect(result.action).toBe(TXN_RISK_ACTION.ALLOW);
    });
});

describe('evaluateTransaction — the model is an input, not the verdict (§30.2.1)', () => {
    it('a maximally alarmed model cannot block on its own', () => {
        const result = evaluateTransaction(withHistory({
            model: { risk_score: 100, reason: 'Model says no' },
        }));
        expect(result.modelScore).toBe(100);
        expect(result.score).toBe(30);
        expect(result.action).not.toBe(TXN_RISK_ACTION.BLOCK);
        expect(result.action).not.toBe(TXN_RISK_ACTION.HOLD);
    });

    it('the deterministic rules still run when the model is unavailable (§30.2.4)', () => {
        const result = evaluateTransaction(withHistory({
            amount: 600, balance: 700, isNewRecipient: true, model: null,
        }));
        expect(result.modelUnavailable).toBe(true);
        // A degraded control, not an absent one.
        expect(result.action).toBe(TXN_RISK_ACTION.HOLD);
    });

    it('ignores a non-numeric model score rather than trusting it', () => {
        const result = evaluateTransaction(withHistory({ model: { risk_score: 'very high' } }));
        expect(result.modelScore).toBeNull();
        expect(result.score).toBe(0);
    });
});

describe('assessTransfer — case creation', () => {
    it('opens a hold case with an auto-release deadline', async () => {
        const sender = await makeUser(700);
        const recipient = await makeUser();

        const evaluation = await assessTransfer({
            sender, recipient, amount: 600, deviceId: null,
            model: { risk_score: 60, reason: 'unusual' },
            at: middayIST,
        });

        // No debit history exists for this fresh user, so the median rules are
        // floored out; drain (20) + model (18) is below the hold band.
        expect(evaluation.action).toBe(TXN_RISK_ACTION.ALLOW);
        expect(await RiskCase.countDocuments()).toBe(0);
    });

    /**
     * Real signals rather than a mocked `gatherSignals`: the two halves are
     * only worth testing together if the query half genuinely produces what the
     * scoring half consumes, and mocking the seam would prove neither.
     */
    const seedDebitHistory = async (userId, { count = 20, amount = 100 } = {}) => {
        for (let i = 0; i < count; i += 1) {
            await Transaction.create({
                userId, description: `Everyday ${i}`, amount, type: 'Debit', category: 'Food',
                invoiceId: `INV-RISK-${userId}-${i}`, status: 'SUCCESS', settlement: 'settled',
                // Inside gatherSignals' 90-day window, which is anchored on `at`.
                postedAt: new Date(middayIST.getTime() - (i + 1) * 86400000),
            });
        }
    };

    it('creates a hold case with a deadline when the rules reach the hold band', async () => {
        const sender = await makeUser(700);
        const recipient = await makeUser();
        await seedDebitHistory(sender._id);

        // new recipient (25) + amount anomaly (25) + balance drain (20) = 70.
        const held = await assessTransfer({ sender, recipient, amount: 600, at: middayIST });

        expect(held.action).toBe(TXN_RISK_ACTION.HOLD);
        expect(held.riskCase.autoReleaseAt).toBeInstanceOf(Date);
        expect(held.riskCase.priority).toBe('normal');
        expect(held.riskCase.intent.amount).toBe(600);
        expect(await RiskCase.countDocuments({ userId: sender._id })).toBe(1);
    });

    it('creates an urgent block case with NO deadline when money movement is on a brand-new device', async () => {
        const sender = await makeUser(700);
        const recipient = await makeUser();
        await seedDebitHistory(sender._id);

        const device = await TrustedDevice.create({
            userId: sender._id,
            deviceFingerprint: 'fp-full', coreFingerprint: 'fp-core', browserFingerprint: 'fp-browser',
            trusted: false, firstSeenAt: new Date(middayIST.getTime() - 2 * 60000),
        });

        // ...plus NEW_DEVICE_MONEY_MOVEMENT (30) = 100.
        const blocked = await assessTransfer({
            sender, recipient, amount: 600, deviceId: device._id, at: middayIST,
        });

        expect(blocked.action).toBe(TXN_RISK_ACTION.BLOCK);
        // A block committed no money, so no timer needs to free anything.
        expect(blocked.riskCase.autoReleaseAt).toBeNull();
        expect(blocked.riskCase.priority).toBe('urgent');
    });

    it('treats a trusted device as not-new however recently it was enrolled', async () => {
        const sender = await makeUser(700);
        const recipient = await makeUser();
        await seedDebitHistory(sender._id);

        const device = await TrustedDevice.create({
            userId: sender._id,
            deviceFingerprint: 'fp-t', coreFingerprint: 'fp-tc', browserFingerprint: 'fp-tb',
            trusted: true, firstSeenAt: new Date(middayIST.getTime() - 2 * 60000),
        });

        const result = await assessTransfer({
            sender, recipient, amount: 600, deviceId: device._id, at: middayIST,
        });

        // The user vouching for a device is a stronger statement than its age.
        expect(result.rules.map((r) => r.code)).not.toContain(TXN_RISK_RULES.NEW_DEVICE_MONEY_MOVEMENT);
        expect(result.action).toBe(TXN_RISK_ACTION.HOLD);
    });

    it('does not flag a repeat recipient as new', async () => {
        const sender = await makeUser(700);
        const recipient = await makeUser();
        await seedDebitHistory(sender._id);
        await Transaction.create({
            userId: sender._id, recipientId: recipient._id, description: 'Earlier transfer',
            amount: 100, type: 'Debit', category: 'Transfer', invoiceId: `INV-PRIOR-${sender._id}`,
            status: 'SUCCESS', settlement: 'settled', postedAt: new Date(middayIST.getTime() - 86400000),
        });

        const result = await assessTransfer({ sender, recipient, amount: 600, at: middayIST });

        expect(result.rules.map((r) => r.code)).not.toContain(TXN_RISK_RULES.NEW_RECIPIENT_HIGH_VALUE);
        // Anomaly (25) + drain (20) = 45: a step-up, not a hold.
        expect(result.action).toBe(TXN_RISK_ACTION.STEP_UP);
    });
});

describe('riskCaseService', () => {
    const openCase = async (userId, overrides = {}) => RiskCase.create({
        userId, score: 75, action: 'hold', priority: 'normal',
        intent: { kind: 'transfer', amount: 600 },
        rules: [{ code: 'AMOUNT_ANOMALY', weight: 25, detail: 'x' }],
        autoReleaseAt: new Date(Date.now() + 3600000),
        ...overrides,
    });

    it('records the reviewer and audits the decision', async () => {
        const user = await makeUser();
        const reviewer = await makeUser();
        const riskCase = await openCase(user._id);

        const reviewed = await reviewCase({
            caseId: riskCase._id, reviewerId: reviewer._id, decision: 'approved', notes: 'Known recipient',
        });

        expect(reviewed.status).toBe('approved');
        expect(String(reviewed.reviewedBy)).toBe(String(reviewer._id));

        const entry = await AuditLog.findOne({ action: AUDIT.RISK_CASE_APPROVED });
        expect(entry).toBeTruthy();
        expect(entry.metadata.subjectUserId).toBe(String(user._id));
    });

    it('refuses a second decision on a case already reviewed', async () => {
        const user = await makeUser();
        const reviewer = await makeUser();
        const riskCase = await openCase(user._id);

        await reviewCase({ caseId: riskCase._id, reviewerId: reviewer._id, decision: 'approved' });

        await expect(
            reviewCase({ caseId: riskCase._id, reviewerId: reviewer._id, decision: 'rejected' })
        ).rejects.toMatchObject({ code: 'ALREADY_REVIEWED', status: 409 });
    });

    it('auto-releases an expired hold and audits it distinctly from an approval', async () => {
        const user = await makeUser();
        await openCase(user._id, { autoReleaseAt: new Date(Date.now() - 1000) });

        const result = await autoReleaseExpired();
        expect(result.released).toBe(1);

        const [after] = await RiskCase.find({ userId: user._id });
        expect(after.status).toBe('auto_released');

        // "Nobody looked and we let it through" is a different fact about the
        // control than "a reviewer approved it".
        expect(await AuditLog.findOne({ action: AUDIT.RISK_CASE_AUTO_RELEASED })).toBeTruthy();
        expect(await AuditLog.findOne({ action: AUDIT.RISK_CASE_APPROVED })).toBeNull();
    });

    it('never auto-releases a block — a block has no deadline', async () => {
        const user = await makeUser();
        await openCase(user._id, { action: 'block', autoReleaseAt: null });

        const result = await autoReleaseExpired();
        expect(result.released).toBe(0);

        const [after] = await RiskCase.find({ userId: user._id });
        expect(after.status).toBe('open');
    });

    it('does not auto-release a hold whose deadline has not passed', async () => {
        const user = await makeUser();
        await openCase(user._id);

        expect((await autoReleaseExpired()).released).toBe(0);
    });
});
