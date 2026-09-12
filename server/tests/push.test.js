import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Otp from '../models/Otp.js';

vi.mock('../utils/sendOtp.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../utils/fastapiClient.js', () => ({
    categorizeTransaction: vi.fn().mockResolvedValue({ category: 'Others', icon: 'CircleDollarSign', confidence_score: 0 }),
    checkFraud: vi.fn().mockResolvedValue({ risk_score: 0, risk_level: 'low', reason: 'test' }),
    default: {},
}));
vi.mock('../utils/socket.js', () => ({
    emitToUser: vi.fn(), getIO: vi.fn(), initSocket: vi.fn(), default: {},
}));
vi.mock('../utils/fcm.js', () => ({
    sendPushNotification: vi.fn().mockResolvedValue({ success: true, failedTokens: [] }),
    default: {},
}));

const { sendPushNotification } = await import('../utils/fcm.js');
const { buildTestApp } = await import('./helpers/app.js');

let app;
beforeAll(() => { app = buildTestApp(); });

const signup = async (email, password = 'Str0ngPass99') => {
    const res = await request(app).post('/api/auth/signup')
        .send({ firstName: email.split('@')[0], email, password });
    return { token: res.body.accessToken, id: res.body.user._id };
};

const auth = (t) => ({ Authorization: `Bearer ${t}` });

const fund = (userId, amount) =>
    User.updateOne({ _id: userId }, { $set: { accountBalance: amount } });

const setDevices = (userId, tokens) =>
    User.updateOne({ _id: userId }, { $set: { fcmTokens: tokens } });

/**
 * Post-transfer notifications are deliberately not awaited by the request — a
 * settled transfer must not be held up, or rolled back, by a push. So the
 * assertion has to wait for them rather than read them straight off the
 * response.
 */
const waitForPushes = async (count, timeoutMs = 2000) => {
    const deadline = Date.now() + timeoutMs;
    while (sendPushNotification.mock.calls.length < count && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return sendPushNotification.mock.calls;
};

/** The tokens `sendPushNotification` was called with, for one user's devices. */
const pushToDevices = (tokens) =>
    sendPushNotification.mock.calls.find(
        ([called]) => called.length === tokens.length && tokens.every((t) => called.includes(t))
    );

describe('transfer push notifications', () => {
    let alice; let bob;

    const ALICE_DEVICES = ['alice-phone', 'alice-laptop', 'alice-tablet'];
    const BOB_DEVICES = ['bob-phone', 'bob-desktop'];

    beforeEach(async () => {
        sendPushNotification.mockClear();
        alice = await signup('alice@example.com');
        bob = await signup('bob@example.com');
        await fund(alice.id, 1000);
        await setDevices(alice.id, ALICE_DEVICES);
        await setDevices(bob.id, BOB_DEVICES);
    });

    it('pushes to every device of both the sender and the recipient', async () => {
        const res = await request(app).post('/api/transactions/transfer')
            .set(auth(alice.token))
            .send({ recipientId: bob.id, amount: 250 });

        expect(res.status).toBe(200);
        await waitForPushes(2);

        const toAlice = pushToDevices(ALICE_DEVICES);
        const toBob = pushToDevices(BOB_DEVICES);

        // Every device, not just the most recently registered one.
        expect(toAlice?.[0]).toEqual(expect.arrayContaining(ALICE_DEVICES));
        expect(toBob?.[0]).toEqual(expect.arrayContaining(BOB_DEVICES));

        expect(toAlice[1]).toMatchObject({ title: 'Transfer Successful' });
        expect(toBob[1]).toMatchObject({ title: 'Money Received' });

        // Data-only: the body travels as `body`, and the click target is set so
        // a background notification can open the right screen.
        expect(toBob[1].body).toContain('250');
        expect(toBob[1].data).toMatchObject({ type: 'Transfer', link: '/activity' });
    });

    it('pushes to both sides of an OTP-verified transfer too', async () => {
        // Cross the same-day threshold so the transfer is challenged, and the
        // settlement therefore happens on the OTP path rather than the direct
        // one. Both paths run through `executeTransfer`; this proves the second
        // entry point notifies as well.
        await Transaction.insertMany(
            Array.from({ length: 5 }, (_, i) => ({
                userId: alice.id, recipientId: bob.id, description: 'seed',
                amount: 1, type: 'Debit', category: 'Transfer',
                invoiceId: `P${i}${Date.now()}`,
            }))
        );

        const challenged = await request(app).post('/api/transactions/transfer')
            .set(auth(alice.token)).send({ recipientId: bob.id, amount: 175 });

        expect(challenged.status).toBe(403);
        expect(challenged.body.require2FA).toBe(true);

        // The code is bcrypt-hashed, so the test replaces the hash with one it
        // knows rather than trying to read the code back out.
        await Otp.updateOne(
            { purpose: 'transfer' },
            { $set: { otpHash: await bcrypt.hash('123456', 10) } }
        );

        sendPushNotification.mockClear();

        const verified = await request(app).post('/api/transactions/verify-otp')
            .set(auth(alice.token)).send({ otp: '123456' });

        expect(verified.status).toBe(200);
        await waitForPushes(2);

        expect(pushToDevices(ALICE_DEVICES)?.[1]).toMatchObject({
            title: 'Transfer Successful',
        });
        expect(pushToDevices(BOB_DEVICES)?.[1]).toMatchObject({
            title: 'Money Received',
        });
    });

    it('skips the push when the user has turned push notifications off', async () => {
        await User.updateOne(
            { _id: bob.id },
            { $set: { 'preferences.pushNotifications': false } }
        );

        await request(app).post('/api/transactions/transfer')
            .set(auth(alice.token))
            .send({ recipientId: bob.id, amount: 100 });

        await waitForPushes(1);

        expect(pushToDevices(ALICE_DEVICES)).toBeTruthy();
        expect(pushToDevices(BOB_DEVICES)).toBeUndefined();
    });
});

describe('device token registration', () => {
    let alice; let bob;

    beforeEach(async () => {
        alice = await signup('alice@example.com');
        bob = await signup('bob@example.com');
    });

    it('registers a device without displacing the others', async () => {
        for (const token of ['phone', 'laptop']) {
            const res = await request(app).post('/api/notifications/token')
                .set(auth(alice.token)).send({ token });
            expect(res.status).toBe(200);
        }

        const user = await User.findById(alice.id).select('fcmTokens');
        expect(user.fcmTokens).toEqual(['phone', 'laptop']);
    });

    it('is idempotent, so a re-registering tab cannot duplicate a device', async () => {
        await request(app).post('/api/notifications/token')
            .set(auth(alice.token)).send({ token: 'phone' });
        await request(app).post('/api/notifications/token')
            .set(auth(alice.token)).send({ token: 'phone' });

        const user = await User.findById(alice.id).select('fcmTokens');
        expect(user.fcmTokens).toEqual(['phone']);
    });

    it('moves a shared device to whoever signed in last', async () => {
        await request(app).post('/api/notifications/token')
            .set(auth(alice.token)).send({ token: 'shared-laptop' });
        await request(app).post('/api/notifications/token')
            .set(auth(bob.token)).send({ token: 'shared-laptop' });

        const [aliceDoc, bobDoc] = await Promise.all([
            User.findById(alice.id).select('fcmTokens'),
            User.findById(bob.id).select('fcmTokens'),
        ]);

        // Otherwise Alice's "You received ₹500" lands on a laptop where Bob is
        // the one signed in.
        expect(aliceDoc.fcmTokens).toEqual([]);
        expect(bobDoc.fcmTokens).toEqual(['shared-laptop']);
    });

    it('unregisters a device on sign-out', async () => {
        await request(app).post('/api/notifications/token')
            .set(auth(alice.token)).send({ token: 'phone' });
        await request(app).post('/api/notifications/token')
            .set(auth(alice.token)).send({ token: 'laptop' });

        const res = await request(app).delete('/api/notifications/token')
            .set(auth(alice.token)).send({ token: 'phone' });

        expect(res.status).toBe(200);
        const user = await User.findById(alice.id).select('fcmTokens');
        expect(user.fcmTokens).toEqual(['laptop']);
    });

    it('drops every device when signing out everywhere', async () => {
        await request(app).post('/api/notifications/token')
            .set(auth(alice.token)).send({ token: 'phone' });

        const res = await request(app).post('/api/auth/logout-all').set(auth(alice.token));
        expect(res.status).toBe(200);

        const user = await User.findById(alice.id).select('fcmTokens');
        expect(user.fcmTokens).toEqual([]);
    });
});
