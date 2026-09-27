import { describe, it, expect, vi } from 'vitest';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Bill from '../models/Bill.js';
import Transaction from '../models/Transaction.js';
import RecurringExpense from '../models/RecurringExpense.js';
import Notification from '../models/Notification.js';
import {
    createBill,
    listBills,
    markPaid,
    seedFromRecurring,
    sendReminders,
    decorate,
} from '../services/billService.js';

vi.mock('../utils/socket.js', () => ({ emitToUser: vi.fn(), getIO: vi.fn(), initSocket: vi.fn(), default: {} }));
vi.mock('../utils/fcm.js', () => ({ sendPushNotification: vi.fn().mockResolvedValue({ success: true, failedTokens: [] }), default: {} }));

const DAY = 86400000;

const makeUser = (balance = 10000) => User.create({
    firstName: 'Biller', email: `b${new mongoose.Types.ObjectId()}@example.com`, password: 'hashed', accountBalance: balance, balanceMinor: Math.round(balance * 100),
});

describe('billService — the "moves no money" invariant (plan.md §19.2)', () => {
    it('marking a bill paid never changes the balance and creates no transaction', async () => {
        const user = await makeUser(10000);
        const bill = await createBill(user._id, {
            billerName: 'Electricity', amountMinor: 150000,
            dueDate: new Date(Date.now() + 2 * DAY), frequency: 'monthly',
        });

        const transactionsBefore = await Transaction.countDocuments();
        await markPaid(user._id, bill._id);

        expect((await User.findById(user._id)).accountBalance).toBe(10000);
        expect(await Transaction.countDocuments()).toBe(transactionsBefore);
    });

    it('links an existing transaction rather than creating one', async () => {
        const user = await makeUser();
        const transaction = await Transaction.create({
            userId: user._id, description: 'Electricity bill', amount: 1500, type: 'Debit',
            category: 'Bills', invoiceId: `INV-BILL-${Date.now()}`, status: 'SUCCESS', settlement: 'settled',
        });
        const bill = await createBill(user._id, {
            billerName: 'Electricity', amountMinor: 150000, dueDate: new Date(), frequency: 'once',
        });

        const { bill: paid } = await markPaid(user._id, bill._id, { transactionId: transaction._id });

        expect(String(paid.paidTransactionId)).toBe(String(transaction._id));
        expect(await Transaction.countDocuments({ userId: user._id })).toBe(1);
    });

    it('refuses to link a transaction belonging to someone else', async () => {
        const user = await makeUser();
        const stranger = await makeUser();
        const theirs = await Transaction.create({
            userId: stranger._id, description: 'Theirs', amount: 100, type: 'Debit',
            category: 'Bills', invoiceId: `INV-OTHER-${Date.now()}`, status: 'SUCCESS', settlement: 'settled',
        });
        const bill = await createBill(user._id, {
            billerName: 'X', dueDate: new Date(), frequency: 'once',
        });

        await expect(markPaid(user._id, bill._id, { transactionId: theirs._id }))
            .rejects.toMatchObject({ code: 'TRANSACTION_NOT_FOUND' });
    });
});

describe('billService — lifecycle', () => {
    it('rolls the next occurrence forward for a recurring bill', async () => {
        const user = await makeUser();
        const dueDate = new Date('2026-03-10T00:00:00.000Z');
        const bill = await createBill(user._id, {
            billerName: 'Rent', amountMinor: 1500000, dueDate, frequency: 'monthly',
        });

        const { next } = await markPaid(user._id, bill._id);

        expect(next).not.toBeNull();
        expect(new Date(next.dueDate).getUTCMonth()).toBe(3); // April
        expect(next.status).toBe('upcoming');
    });

    it('does not roll forward a one-off bill', async () => {
        const user = await makeUser();
        const bill = await createBill(user._id, {
            billerName: 'Deposit', amountMinor: 500000, dueDate: new Date(), frequency: 'once',
        });

        const { next } = await markPaid(user._id, bill._id);
        expect(next).toBeNull();
    });

    it('refuses to mark the same bill paid twice', async () => {
        const user = await makeUser();
        const bill = await createBill(user._id, {
            billerName: 'Water', dueDate: new Date(), frequency: 'once',
        });
        await markPaid(user._id, bill._id);

        await expect(markPaid(user._id, bill._id)).rejects.toMatchObject({ code: 'ALREADY_PAID', status: 409 });
    });
});

describe('billService — derived overdue state', () => {
    it('derives overdue from the clock rather than storing it', async () => {
        const user = await makeUser();
        await createBill(user._id, {
            billerName: 'Late', dueDate: new Date(Date.now() - 3 * DAY), frequency: 'monthly',
        });

        const [bill] = await listBills(user._id);

        // The stored status is untouched; only the view says overdue, so the
        // answer never depends on whether a cron has run.
        expect(bill.status).toBe('upcoming');
        expect(bill.overdue).toBe(true);
        expect(bill.displayStatus).toBe('overdue');
    });

    it('a paid bill past its date is not overdue', () => {
        const decorated = decorate({
            status: 'paid', dueDate: new Date(Date.now() - 10 * DAY), amountMinor: 100,
        });
        expect(decorated.overdue).toBe(false);
        expect(decorated.displayStatus).toBe('paid');
    });
});

describe('billService — seeding from recurring detections', () => {
    const makeDetection = (userId, overrides = {}) => RecurringExpense.create({
        userId, merchantKey: 'netflix', displayName: 'Netflix', amountMinor: 64900,
        cadence: 'monthly', firstSeenAt: new Date(), lastSeenAt: new Date(),
        nextExpectedAt: new Date(Date.now() + 10 * DAY), occurrences: 4, confidence: 0.85,
        ...overrides,
    });

    it('seeds a bill from a high-confidence monthly detection', async () => {
        const user = await makeUser();
        await makeDetection(user._id);

        const result = await seedFromRecurring(user._id);

        expect(result.seeded).toBe(1);
        const [bill] = await Bill.find({ userId: user._id });
        expect(bill.billerName).toBe('Netflix');
        expect(bill.autoDetectedFromRecurringId).toBeTruthy();
    });

    it('is idempotent — a second pass seeds nothing', async () => {
        const user = await makeUser();
        await makeDetection(user._id);

        await seedFromRecurring(user._id);
        const second = await seedFromRecurring(user._id);

        expect(second.seeded).toBe(0);
        expect(await Bill.countDocuments({ userId: user._id })).toBe(1);
    });

    it('skips weekly detections — a weekly charge is a habit, not a bill', async () => {
        const user = await makeUser();
        await makeDetection(user._id, { cadence: 'weekly', merchantKey: 'coffee' });

        expect((await seedFromRecurring(user._id)).seeded).toBe(0);
    });

    it('skips low-confidence detections', async () => {
        const user = await makeUser();
        await makeDetection(user._id, { confidence: 0.55 });

        expect((await seedFromRecurring(user._id)).seeded).toBe(0);
    });
});

describe('billService — reminders', () => {
    it('notifies inside the reminder window and not before it', async () => {
        const user = await makeUser();
        await createBill(user._id, {
            billerName: 'Soon', dueDate: new Date(Date.now() + 2 * DAY),
            frequency: 'monthly', reminderDaysBefore: 3,
        });
        await createBill(user._id, {
            billerName: 'Later', dueDate: new Date(Date.now() + 20 * DAY),
            frequency: 'monthly', reminderDaysBefore: 3,
        });

        const result = await sendReminders();

        expect(result.sent).toBe(1);
        const notifications = await Notification.find({ userId: user._id, type: 'Bill' });
        expect(notifications).toHaveLength(1);
        expect(notifications[0].message).toContain('Soon');
        // The copy must never imply PayPro pays it (§19.2).
        expect(notifications[0].message).toContain('Reminder only');
    });

    it('notifies about an overdue bill', async () => {
        const user = await makeUser();
        await createBill(user._id, {
            billerName: 'Late', dueDate: new Date(Date.now() - 2 * DAY),
            frequency: 'monthly', reminderDaysBefore: 3,
        });

        await sendReminders();

        const [notification] = await Notification.find({ userId: user._id, type: 'Bill' });
        expect(notification.title).toBe('Bill overdue');
    });

    it('does not double-notify when the job runs twice in one day', async () => {
        const user = await makeUser();
        await createBill(user._id, {
            billerName: 'Soon', dueDate: new Date(Date.now() + 1 * DAY),
            frequency: 'monthly', reminderDaysBefore: 3,
        });

        await sendReminders();
        await sendReminders();

        expect(await Notification.countDocuments({ userId: user._id, type: 'Bill' })).toBe(1);
    });
});
