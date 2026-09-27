import { describe, it, expect, vi } from 'vitest';
import mongoose from 'mongoose';
import User from '../models/User.js';
import CategoryRule from '../models/CategoryRule.js';
import { findMatchingRule, saveRule, listRules, deleteRule } from '../services/categoryService.js';
import { issuePaymentCode, verifyPaymentCode } from '../services/paymentCodeService.js';

vi.mock('../utils/socket.js', () => ({ emitToUser: vi.fn(), getIO: vi.fn(), initSocket: vi.fn(), default: {} }));
vi.mock('../utils/fcm.js', () => ({ sendPushNotification: vi.fn().mockResolvedValue({ success: true, failedTokens: [] }), default: {} }));

const makeUser = () => User.create({
    firstName: 'Ruler', email: `c${new mongoose.Types.ObjectId()}@example.com`, password: 'hashed',
});

describe('categoryService — standing rules (plan.md §12.4)', () => {
    it('matches a later transaction from the same merchant despite per-charge noise', async () => {
        const user = await makeUser();
        await saveRule(user._id, { description: 'Netflix order 2847', category: 'Entertainment' });

        const match = await findMatchingRule(user._id, 'Netflix order 9931');

        expect(match).not.toBeNull();
        expect(match.category).toBe('Entertainment');
        expect(match.categorySource).toBe('rule');
    });

    it('does not match an unrelated merchant', async () => {
        const user = await makeUser();
        await saveRule(user._id, { description: 'Netflix', category: 'Entertainment' });

        expect(await findMatchingRule(user._id, 'Corner Grocery')).toBeNull();
    });

    it('is scoped to one user — a rule never leaks across accounts', async () => {
        const user = await makeUser();
        const other = await makeUser();
        await saveRule(user._id, { description: 'Netflix', category: 'Entertainment' });

        expect(await findMatchingRule(other._id, 'Netflix')).toBeNull();
    });

    it('replaces rather than duplicates when the user changes their mind', async () => {
        const user = await makeUser();
        await saveRule(user._id, { description: 'Netflix', category: 'Entertainment' });
        await saveRule(user._id, { description: 'Netflix', category: 'Subscription' });

        const rules = await listRules(user._id);
        expect(rules).toHaveLength(1);
        expect(rules[0].category).toBe('Subscription');
    });

    it('refuses to store a system category as a rule', async () => {
        const user = await makeUser();

        expect(await saveRule(user._id, { description: 'Netflix', category: 'Transfer' })).toBeNull();
        expect(await listRules(user._id)).toHaveLength(0);
    });

    it('refuses a description with nothing groupable in it', async () => {
        const user = await makeUser();

        expect(await saveRule(user._id, { description: '12345', category: 'Food' })).toBeNull();
    });

    it('ignores a rule naming a category that no longer exists', async () => {
        const user = await makeUser();
        // Written directly: `saveRule` would reject it, but a rule can outlive
        // the category it names across releases.
        await CategoryRule.create({ userId: user._id, merchantKey: 'netflix', category: 'Obsolete' });

        // A stale rule must not re-introduce an unknown category to the database.
        expect(await findMatchingRule(user._id, 'Netflix')).toBeNull();
    });

    it('counts how often a rule has applied', async () => {
        const user = await makeUser();
        await saveRule(user._id, { description: 'Netflix', category: 'Entertainment' });

        await findMatchingRule(user._id, 'Netflix');
        await findMatchingRule(user._id, 'Netflix');
        // The counter is written best-effort and not awaited by the caller.
        await new Promise((resolve) => setTimeout(resolve, 50));

        const [rule] = await listRules(user._id);
        expect(rule.appliedCount).toBeGreaterThanOrEqual(1);
    });

    it('deletes only the caller’s own rule', async () => {
        const user = await makeUser();
        const other = await makeUser();
        const rule = await saveRule(user._id, { description: 'Netflix', category: 'Entertainment' });

        expect(await deleteRule(other._id, rule._id)).toBeNull();
        expect(await deleteRule(user._id, rule._id)).not.toBeNull();
        expect(await listRules(user._id)).toHaveLength(0);
    });
});

describe('paymentCodeService — signed QR codes (plan.md §9.3)', () => {
    const userId = new mongoose.Types.ObjectId().toString();

    it('round-trips a freshly issued code', () => {
        const { code } = issuePaymentCode(userId);
        expect(verifyPaymentCode(code)).toEqual({ ok: true, userId });
    });

    it('rejects a forged code naming an arbitrary user id', () => {
        const forged = `${Buffer.from(JSON.stringify({
            v: 1, uid: new mongoose.Types.ObjectId().toString(), exp: Math.floor(Date.now() / 1000) + 300,
        })).toString('base64url')}.notarealsignature`;

        expect(verifyPaymentCode(forged).ok).toBe(false);
    });

    it('rejects a code whose payload was tampered with after signing', () => {
        const victim = new mongoose.Types.ObjectId().toString();
        const { code } = issuePaymentCode(victim);
        const [, signature] = code.split('.');

        const swapped = Buffer.from(JSON.stringify({
            v: 1, uid: new mongoose.Types.ObjectId().toString(), exp: Math.floor(Date.now() / 1000) + 300,
        })).toString('base64url');

        expect(verifyPaymentCode(`${swapped}.${signature}`).ok).toBe(false);
    });

    it('rejects an expired code, and says so distinctly from a forgery', () => {
        const issuedLongAgo = Date.now() - 10 * 60 * 1000;
        const { code } = issuePaymentCode(userId, { now: issuedLongAgo });

        const result = verifyPaymentCode(code);
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/expired/i);
    });

    it('rejects malformed input without throwing', () => {
        for (const bad of ['', 'nonsense', 'a.b', null, undefined, 'x'.repeat(600), 'abc.']) {
            expect(verifyPaymentCode(bad).ok).toBe(false);
        }
    });

    it('rejects a signature of a different length without throwing', () => {
        // timingSafeEqual throws on a length mismatch; the length check must
        // come first, and the attacker controls the length.
        const { code } = issuePaymentCode(userId);
        const [payload] = code.split('.');

        expect(() => verifyPaymentCode(`${payload}.short`)).not.toThrow();
        expect(verifyPaymentCode(`${payload}.short`).ok).toBe(false);
    });
});
