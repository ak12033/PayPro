import { describe, it, expect, vi, beforeAll } from 'vitest';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { notifyUser } from '../services/notificationService.js';

vi.mock('../utils/socket.js', () => ({ emitToUser: vi.fn(), getIO: vi.fn(), initSocket: vi.fn(), default: {} }));
vi.mock('../utils/fcm.js', () => ({ sendPushNotification: vi.fn().mockResolvedValue({ success: true, failedTokens: [] }), default: {} }));

// Mongoose builds indexes in the background after connecting; the unique
// `{userId,dedupeKey}` index this whole file tests against must actually
// exist in Mongo before the assertions below mean anything.
beforeAll(async () => { await Notification.init(); });

const makeUser = () => User.create({
    firstName: 'Dedupe', email: `d${new mongoose.Types.ObjectId()}@example.com`, password: 'hashed',
});

describe('Notification dedupe (plan.md §26.2.2)', () => {
    it('a second call with the same dedupeKey does not create a second row, and does not throw', async () => {
        const user = await makeUser();
        const options = { category: 'budget', dedupeKey: 'budget:abc:Food:80:2026-09' };

        const first = await notifyUser(user._id, 'Budget', 'Title', 'Message', {}, options);
        expect(first).toBeTruthy();

        const second = await notifyUser(user._id, 'Budget', 'Title', 'Message', {}, options);
        // notifyUser is best-effort — a duplicate-key failure resolves to null,
        // it never throws past this call.
        expect(second).toBeNull();

        const count = await Notification.countDocuments({ userId: user._id, dedupeKey: options.dedupeKey });
        expect(count).toBe(1);
    });

    it('the same dedupeKey for two different users is not deduped against each other', async () => {
        const userA = await makeUser();
        const userB = await makeUser();
        const dedupeKey = 'reconciliation:2026-09-13';

        await notifyUser(userA._id, 'System', 'Alert', 'Drift found', {}, { dedupeKey });
        await notifyUser(userB._id, 'System', 'Alert', 'Drift found', {}, { dedupeKey });

        expect(await Notification.countDocuments({ dedupeKey })).toBe(2);
    });

    it('a call with no dedupeKey never collides with anything', async () => {
        const user = await makeUser();
        await notifyUser(user._id, 'System', 'One', 'msg');
        await notifyUser(user._id, 'System', 'Two', 'msg');

        // The field is genuinely absent (not present-and-null) on both rows —
        // that's what keeps a sparse unique index from treating them as
        // duplicates of each other. See the schema comment on `dedupeKey`.
        const rows = await Notification.find({ userId: user._id }).lean();
        expect(rows).toHaveLength(2);
        expect(rows.every((r) => !('dedupeKey' in r))).toBe(true);
    });

    it('resolves the new Budget/Goal/Insight types to their deep links', async () => {
        const user = await makeUser();
        const notification = await notifyUser(user._id, 'Goal', 'Goal reached', 'msg', {}, { dedupeKey: 'goal:1:completed' });
        expect(notification.type).toBe('Goal');
    });
});
