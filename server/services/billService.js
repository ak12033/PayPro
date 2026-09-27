import Bill from '../models/Bill.js';
import Transaction from '../models/Transaction.js';
import RecurringExpense from '../models/RecurringExpense.js';
import { notifyUser } from './notificationService.js';
import { startOfDayIST } from '../utils/period.js';
import { fromPaise } from '../utils/money.js';
import logger from '../utils/logger.js';
import { iconFor } from './categoryService.js';

/**
 * Bill reminders (plan.md §19.2).
 *
 * This service is deliberately incapable of paying anything. It has no
 * reference to `ledgerService`, no import of anything that can move a balance,
 * and `markPaid` below takes a transaction id rather than an amount — the
 * money moved somewhere else, by some other means, and this only records that
 * it did.
 */

export class BillError extends Error {
    constructor(code, message, status = 400) {
        super(message);
        this.name = 'BillError';
        this.code = code;
        this.status = status;
    }
}

const DAY_MS = 24 * 60 * 60 * 1000;

const FREQUENCY_ADVANCE = {
    weekly: (date) => new Date(date.getTime() + 7 * DAY_MS),
    monthly: (date) => {
        const next = new Date(date);
        next.setMonth(next.getMonth() + 1);
        return next;
    },
    quarterly: (date) => {
        const next = new Date(date);
        next.setMonth(next.getMonth() + 3);
        return next;
    },
    yearly: (date) => {
        const next = new Date(date);
        next.setFullYear(next.getFullYear() + 1);
        return next;
    },
};

/**
 * Add the derived fields the UI needs. `overdue` is computed here rather than
 * stored: a bill that lapsed an hour ago is overdue whether or not a cron has
 * run since, and a stored flag would make the API's answer depend on scheduler
 * health rather than on the clock.
 */
export const decorate = (bill, now = new Date()) => {
    const due = new Date(bill.dueDate);
    const daysUntilDue = Math.ceil((due - startOfDayIST(now)) / DAY_MS);
    return {
        ...bill,
        amount: bill.amountMinor == null ? null : fromPaise(bill.amountMinor),
        daysUntilDue,
        overdue: bill.status === 'upcoming' && due < now,
        /** The status the UI should render, with 'overdue' folded in (plan.md §19.2's enum). */
        displayStatus: bill.status === 'upcoming' && due < now ? 'overdue' : bill.status,
    };
};

export const listBills = async (userId, { status, now = new Date() } = {}) => {
    const query = { userId, archivedAt: null };
    if (status && status !== 'overdue') query.status = status;

    const bills = await Bill.find(query).sort({ dueDate: 1 }).lean();
    const decorated = bills.map((bill) => decorate(bill, now));

    // 'overdue' is a view over 'upcoming', so it has to filter after decoration.
    return status === 'overdue' ? decorated.filter((b) => b.overdue) : decorated;
};

export const createBill = async (userId, payload) => {
    const bill = await Bill.create({
        userId,
        billerName: payload.billerName,
        category: payload.category,
        icon: iconFor(payload.category),
        customerRef: payload.customerRef,
        amountMinor: payload.amountMinor,
        dueDate: payload.dueDate,
        frequency: payload.frequency,
        reminderDaysBefore: payload.reminderDaysBefore,
    });
    return decorate(bill.toObject());
};

export const updateBill = async (userId, billId, payload) => {
    const bill = await Bill.findOne({ _id: billId, userId, archivedAt: null });
    if (!bill) throw new BillError('NOT_FOUND', 'Bill not found', 404);

    for (const key of ['billerName', 'category', 'customerRef', 'amountMinor', 'dueDate', 'frequency', 'reminderDaysBefore', 'status']) {
        if (payload[key] !== undefined) bill[key] = payload[key];
    }
    if (payload.category !== undefined) bill.icon = iconFor(payload.category);
    await bill.save();
    return decorate(bill.toObject());
};

export const deleteBill = async (userId, billId) => {
    const bill = await Bill.findOneAndUpdate(
        { _id: billId, userId },
        { $set: { archivedAt: new Date() } },
        { new: true }
    );
    if (!bill) throw new BillError('NOT_FOUND', 'Bill not found', 404);
    return bill;
};

/**
 * Record that a bill was paid — elsewhere.
 *
 * `transactionId` is optional and, when given, must already belong to this
 * user. It is *linked*, never created: this function writes nothing to the
 * ledger and touches no balance. A recurring bill immediately materialises its
 * next occurrence so the reminder chain continues without the user re-adding it.
 */
export const markPaid = async (userId, billId, { transactionId = null, now = new Date() } = {}) => {
    const bill = await Bill.findOne({ _id: billId, userId, archivedAt: null });
    if (!bill) throw new BillError('NOT_FOUND', 'Bill not found', 404);
    if (bill.status === 'paid') throw new BillError('ALREADY_PAID', 'This bill is already marked paid', 409);

    if (transactionId) {
        const owned = await Transaction.exists({ _id: transactionId, userId });
        if (!owned) throw new BillError('TRANSACTION_NOT_FOUND', 'That transaction does not exist', 404);
    }

    bill.status = 'paid';
    bill.paidAt = now;
    bill.paidTransactionId = transactionId;
    await bill.save();

    let next = null;
    const advance = FREQUENCY_ADVANCE[bill.frequency];
    if (advance) {
        next = await Bill.create({
            userId,
            billerName: bill.billerName,
            category: bill.category,
            icon: bill.icon,
            customerRef: bill.customerRef,
            amountMinor: bill.amountMinor,
            dueDate: advance(new Date(bill.dueDate)),
            frequency: bill.frequency,
            reminderDaysBefore: bill.reminderDaysBefore,
            // Deliberately NOT copied: the unique partial index allows only one
            // live bill per detection, and the next occurrence is a bill in its
            // own right rather than a second materialisation of the detection.
        });
    }

    return { bill: decorate(bill.toObject(), now), next: next ? decorate(next.toObject(), now) : null };
};

/**
 * Seed bills from high-confidence recurring detections (plan.md §19.2).
 *
 * Only `monthly`/`quarterly`/`yearly` detections become bills: a weekly charge
 * is a habit, not a bill, and turning one into a reminder produces 52 pieces of
 * noise a year. The unique partial index on
 * `{userId, autoDetectedFromRecurringId}` makes repeated runs a no-op.
 */
export const seedFromRecurring = async (userId, { minConfidence = 0.7 } = {}) => {
    const detections = await RecurringExpense.find({
        userId,
        status: 'active',
        confidence: { $gte: minConfidence },
        cadence: { $in: ['monthly', 'quarterly', 'yearly'] },
    }).lean();

    let seeded = 0;
    for (const detection of detections) {
        try {
            await Bill.create({
                userId,
                billerName: detection.displayName,
                category: detection.category,
                icon: detection.icon,
                amountMinor: detection.amountMinor,
                dueDate: detection.nextExpectedAt,
                frequency: detection.cadence,
                autoDetectedFromRecurringId: detection._id,
            });
            seeded += 1;
        } catch (err) {
            // 11000 = already seeded. That is the index doing its job, not a failure.
            if (err.code !== 11000) {
                logger.error('Bill seeding failed for one detection', {
                    userId: String(userId), detectionId: String(detection._id), error: err.message,
                });
            }
        }
    }
    return { seeded, candidates: detections.length };
};

/**
 * Send reminders for everything due within its own `reminderDaysBefore` window,
 * plus a separate notice for anything already overdue.
 *
 * Deduped per bill per calendar day via `Notification.dedupeKey`, so re-running
 * the job (a retried deploy, a second replica) cannot double-notify.
 */
export const sendReminders = async ({ now = new Date() } = {}) => {
    const horizon = new Date(now.getTime() + 30 * DAY_MS);
    const dayKey = startOfDayIST(now).toISOString().slice(0, 10);

    const bills = await Bill.find({
        status: 'upcoming',
        archivedAt: null,
        dueDate: { $lte: horizon },
    }).lean();

    let sent = 0;
    for (const bill of bills) {
        const { daysUntilDue, overdue, amount } = decorate(bill, now);

        const dueWindow = daysUntilDue >= 0 && daysUntilDue <= bill.reminderDaysBefore;
        if (!dueWindow && !overdue) continue;

        const amountText = amount == null ? '' : ` of ₹${amount}`;
        const title = overdue ? 'Bill overdue' : 'Bill due soon';
        const message = overdue
            ? `Your ${bill.billerName} bill${amountText} was due ${Math.abs(daysUntilDue)} day(s) ago. Pay it with your usual method and mark it here.`
            : `Your ${bill.billerName} bill${amountText} is due ${daysUntilDue === 0 ? 'today' : `in ${daysUntilDue} day(s)`}. Reminder only — pay it with your usual method and mark it here.`;

        await notifyUser(
            bill.userId, 'Bill', title, message,
            { billId: String(bill._id), dueDate: bill.dueDate },
            { category: 'bill', dedupeKey: `bill:${bill._id}:${overdue ? 'overdue' : 'due'}:${dayKey}` }
        );
        sent += 1;
    }

    return { sent, considered: bills.length };
};

export default {
    decorate,
    listBills,
    createBill,
    updateBill,
    deleteBill,
    markPaid,
    seedFromRecurring,
    sendReminders,
    BillError,
};
