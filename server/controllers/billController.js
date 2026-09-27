import { asyncHandler } from '../utils/asyncHandler.js';
import { asObjectId, asEnum, asString } from '../utils/sanitize.js';
import { audit } from '../services/auditService.js';
import { AUDIT } from '../models/AuditLog.js';
import { CATEGORY_NAMES } from '../constants/categories.js';
import { parseAmount } from '../utils/money.js';
import { toPaise } from '../utils/money.js';
import {
    listBills,
    createBill,
    updateBill,
    deleteBill,
    markPaid,
    seedFromRecurring,
    BillError,
} from '../services/billService.js';

const FREQUENCIES = ['once', 'weekly', 'monthly', 'quarterly', 'yearly'];
const STATUSES = ['upcoming', 'paid', 'skipped', 'overdue'];

const handle = (res, err) => {
    if (err instanceof BillError) {
        res.status(err.status).json({ message: err.message });
        return true;
    }
    return false;
};

/**
 * Amounts arrive as rupees (every other client form posts rupees) and are
 * stored as paise. `parseAmount` is reused so a bill amount is validated on
 * exactly the same terms as a transfer amount — same precision rules, same
 * ceiling, same rejection of `{$gt: 0}`-shaped payloads.
 */
const parseOptionalAmount = (raw) => {
    if (raw === undefined || raw === null || raw === '') return { ok: true, minor: undefined };
    const parsed = parseAmount(raw);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    return { ok: true, minor: toPaise(parsed.value) };
};

const parseDueDate = (raw) => {
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
};

export const getBills = asyncHandler(async (req, res) => {
    const status = asEnum(req.query.status, STATUSES);
    res.status(200).json({ bills: await listBills(req.user.id, { status }) });
});

export const postBill = asyncHandler(async (req, res) => {
    const billerName = asString(req.body?.billerName, { maxLength: 80 });
    if (!billerName) return res.status(400).json({ message: 'A biller name is required' });

    const dueDate = parseDueDate(req.body?.dueDate);
    if (!dueDate) return res.status(400).json({ message: 'A valid due date is required' });

    const amount = parseOptionalAmount(req.body?.amount);
    if (!amount.ok) return res.status(400).json({ message: amount.error });

    const bill = await createBill(req.user.id, {
        billerName,
        category: asEnum(req.body?.category, CATEGORY_NAMES) || 'Bills',
        customerRef: asString(req.body?.customerRef, { maxLength: 80 }) || undefined,
        amountMinor: amount.minor,
        dueDate,
        frequency: asEnum(req.body?.frequency, FREQUENCIES) || 'monthly',
        reminderDaysBefore: Number.isInteger(req.body?.reminderDaysBefore)
            ? Math.min(30, Math.max(0, req.body.reminderDaysBefore))
            : undefined,
    });

    audit(AUDIT.BILL_CREATED, {
        userId: req.user.id, req,
        target: { type: 'Bill', id: String(bill._id) },
        metadata: { billerName, dueDate },
    });

    res.status(201).json({ bill });
});

export const patchBill = asyncHandler(async (req, res) => {
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'A valid bill id is required' });

    const payload = {};

    const billerName = asString(req.body?.billerName, { maxLength: 80 });
    if (billerName) payload.billerName = billerName;

    const category = asEnum(req.body?.category, CATEGORY_NAMES);
    if (category) payload.category = category;

    if (req.body?.customerRef !== undefined) {
        payload.customerRef = asString(req.body.customerRef, { maxLength: 80 }) || '';
    }

    if (req.body?.amount !== undefined) {
        const amount = parseOptionalAmount(req.body.amount);
        if (!amount.ok) return res.status(400).json({ message: amount.error });
        payload.amountMinor = amount.minor ?? null;
    }

    if (req.body?.dueDate !== undefined) {
        const dueDate = parseDueDate(req.body.dueDate);
        if (!dueDate) return res.status(400).json({ message: 'A valid due date is required' });
        payload.dueDate = dueDate;
    }

    const frequency = asEnum(req.body?.frequency, FREQUENCIES);
    if (frequency) payload.frequency = frequency;

    // 'paid' is reached through /mark-paid, which links a transaction and rolls
    // the next occurrence — letting PATCH set it would skip both.
    const status = asEnum(req.body?.status, ['upcoming', 'skipped']);
    if (status) payload.status = status;

    if (Number.isInteger(req.body?.reminderDaysBefore)) {
        payload.reminderDaysBefore = Math.min(30, Math.max(0, req.body.reminderDaysBefore));
    }

    if (!Object.keys(payload).length) return res.status(400).json({ message: 'Nothing to update' });

    try {
        const bill = await updateBill(req.user.id, id, payload);
        audit(AUDIT.BILL_UPDATED, {
            userId: req.user.id, req, target: { type: 'Bill', id: String(id) }, metadata: payload,
        });
        res.status(200).json({ bill });
    } catch (err) {
        if (!handle(res, err)) throw err;
    }
});

export const removeBill = asyncHandler(async (req, res) => {
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'A valid bill id is required' });

    try {
        await deleteBill(req.user.id, id);
        audit(AUDIT.BILL_DELETED, { userId: req.user.id, req, target: { type: 'Bill', id: String(id) } });
        res.status(200).json({ message: 'Bill removed' });
    } catch (err) {
        if (!handle(res, err)) throw err;
    }
});

/**
 * Record that a bill was paid elsewhere. This endpoint moves no money — see
 * `billService` for why that is structural rather than an omission.
 */
export const postMarkPaid = asyncHandler(async (req, res) => {
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'A valid bill id is required' });

    const transactionId = req.body?.transactionId ? asObjectId(req.body.transactionId) : null;
    if (req.body?.transactionId && !transactionId) {
        return res.status(400).json({ message: 'A valid transaction id is required' });
    }

    try {
        const result = await markPaid(req.user.id, id, { transactionId });
        audit(AUDIT.BILL_MARKED_PAID, {
            userId: req.user.id, req,
            target: { type: 'Bill', id: String(id) },
            metadata: { transactionId: String(transactionId || '') },
        });
        res.status(200).json(result);
    } catch (err) {
        if (!handle(res, err)) throw err;
    }
});

/** Turn high-confidence recurring detections into bill reminders (plan.md §19.2). */
export const postSeedFromRecurring = asyncHandler(async (req, res) => {
    const result = await seedFromRecurring(req.user.id);
    res.status(200).json({ ...result, bills: await listBills(req.user.id) });
});
