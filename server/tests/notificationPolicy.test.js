import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import User from '../models/User.js';
import { pushDecision, inQuietHours, hourIn, CATEGORY_BY_TYPE, MUTABLE_CATEGORIES } from '../services/notificationPolicy.js';

vi.mock('../utils/sendOtp.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../utils/socket.js', () => ({
    emitToUser: vi.fn(), getIO: vi.fn(), initSocket: vi.fn(), default: {},
}));

/** Per-category push and quiet hours (plan.md §26.2.4, §26.2.5). */
const { buildTestApp } = await import('./helpers/app.js');

/** 23:30 IST = 18:00 UTC; 12:30 IST = 07:00 UTC. */
const LATE_NIGHT_IST = new Date('2026-09-14T18:00:00Z');
const MIDDAY_IST = new Date('2026-09-14T07:00:00Z');
const QUIET = { enabled: true, start: 22, end: 7 };

describe('hourIn / inQuietHours', () => {
    it('reads the hour in IST, not in the server’s zone', () => {
        expect(hourIn(LATE_NIGHT_IST)).toBe(23);
        expect(hourIn(MIDDAY_IST)).toBe(12);
        expect(hourIn(new Date('2026-09-14T18:30:00Z'))).toBe(0);
    });

    it('handles a window that wraps midnight, and one that does not', () => {
        expect(inQuietHours(QUIET, 23)).toBe(true);
        expect(inQuietHours(QUIET, 3)).toBe(true);
        expect(inQuietHours(QUIET, 7)).toBe(false);
        expect(inQuietHours(QUIET, 21)).toBe(false);
        expect(inQuietHours({ enabled: true, start: 13, end: 15 }, 14)).toBe(true);
        expect(inQuietHours({ enabled: true, start: 13, end: 15 }, 15)).toBe(false);
    });

    it('never silences everything by accident', () => {
        expect(inQuietHours({ enabled: true, start: 9, end: 9 }, 9)).toBe(false);
        expect(inQuietHours({ enabled: false, start: 0, end: 23 }, 5)).toBe(false);
        expect(inQuietHours(undefined, 5)).toBe(false);
    });
});

describe('pushDecision', () => {
    it('sends by default', () => {
        expect(pushDecision({ type: 'Payment', preferences: {}, now: MIDDAY_IST })).toEqual({ send: true, reason: null });
    });

    it('lets the master switch silence everything, security included', () => {
        const preferences = { pushNotifications: false };
        expect(pushDecision({ type: 'Payment', preferences }).send).toBe(false);
        expect(pushDecision({ type: 'Security', preferences }).reason).toBe('push_disabled');
    });

    it('honours a category switch', () => {
        const preferences = { pushCategories: { budget: false } };
        expect(pushDecision({ type: 'Budget', preferences, now: MIDDAY_IST })).toEqual({ send: false, reason: 'category_disabled' });
        expect(pushDecision({ type: 'Goal', preferences, now: MIDDAY_IST }).send).toBe(true);
    });

    it('holds non-security pushes during quiet hours', () => {
        const preferences = { quietHours: QUIET };
        expect(pushDecision({ type: 'Transfer', preferences, now: LATE_NIGHT_IST }).reason).toBe('quiet_hours');
        expect(pushDecision({ type: 'Transfer', preferences, now: MIDDAY_IST }).send).toBe(true);
    });

    it('never lets categories or quiet hours hold back a security or system alert (§26.3)', () => {
        const preferences = {
            pushCategories: Object.fromEntries(MUTABLE_CATEGORIES.map((c) => [c, false])),
            quietHours: QUIET,
            security: false,
        };
        expect(pushDecision({ type: 'Security', preferences, now: LATE_NIGHT_IST }).send).toBe(true);
        expect(pushDecision({ type: 'System', preferences, now: LATE_NIGHT_IST }).send).toBe(true);
        expect(MUTABLE_CATEGORIES).not.toContain('security');
    });

    it('maps every notification type the model allows', async () => {
        const Notification = (await import('../models/Notification.js')).default;
        for (const type of Notification.schema.path('type').enumValues) {
            expect(CATEGORY_BY_TYPE[type], type).toBeDefined();
        }
    });
});

describe('PUT /api/users/settings — nested notification preferences', () => {
    let app;
    beforeAll(() => { app = buildTestApp(); });

    it('stores known categories and a valid window, ignoring everything else', async () => {
        const signup = await request(app).post('/api/auth/signup')
            .send({ firstName: 'Quiet', email: 'quiet@example.com', password: 'Str0ngPass99' });
        const auth = { Authorization: `Bearer ${signup.body.accessToken}` };

        const res = await request(app).put('/api/users/settings').set(auth).send({
            pushCategories: { budget: false, insights: 'false', security: false, hacked: true },
            quietHours: { enabled: true, start: 23, end: 99 },
        });
        expect(res.status).toBe(200);

        const user = await User.findById(signup.body.user._id).lean();
        expect(user.preferences.pushCategories.budget).toBe(false);
        expect(user.preferences.pushCategories.insights).toBe(true);
        expect(user.preferences.pushCategories.security).toBeUndefined();
        expect(user.preferences.pushCategories.hacked).toBeUndefined();
        expect(user.preferences.quietHours).toEqual({ enabled: true, start: 23, end: 7 });
    });
});
