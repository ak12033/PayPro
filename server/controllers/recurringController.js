import { asyncHandler } from '../utils/asyncHandler.js';
import { asObjectId, asEnum, asString, asInt } from '../utils/sanitize.js';
import { audit } from '../services/auditService.js';
import { AUDIT } from '../models/AuditLog.js';
import { CATEGORY_NAMES } from '../constants/categories.js';
import {
    listRecurring,
    getUpcoming,
    updateRecurring,
    dismissRecurring,
    detectForUser,
    RecurringError,
} from '../services/recurringService.js';

const STATUSES = ['active', 'paused', 'cancelled', 'dismissed', 'all'];

const handle = (res, err) => {
    if (err instanceof RecurringError) {
        res.status(err.status).json({ message: err.message });
        return true;
    }
    return false;
};

export const getRecurring = asyncHandler(async (req, res) => {
    const status = asEnum(req.query.status, STATUSES) || 'active';
    const items = await listRecurring(req.user.id, { status });
    res.status(200).json({ recurring: items });
});

export const getUpcomingRecurring = asyncHandler(async (req, res) => {
    const days = asInt(req.query.days, { min: 1, max: 90, fallback: 30 });
    res.status(200).json(await getUpcoming(req.user.id, { days }));
});

export const patchRecurring = asyncHandler(async (req, res) => {
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'A valid id is required' });

    const payload = {};
    const displayName = asString(req.body?.displayName, { maxLength: 80 });
    if (displayName) payload.displayName = displayName;

    const category = asEnum(req.body?.category, CATEGORY_NAMES);
    if (category) payload.category = category;

    // 'dismissed' is reached through DELETE, which is what the client calls —
    // allowing it here too would give one action two spellings.
    const status = asEnum(req.body?.status, ['active', 'paused', 'cancelled']);
    if (status) payload.status = status;

    if (!Object.keys(payload).length) {
        return res.status(400).json({ message: 'Nothing to update' });
    }

    try {
        const item = await updateRecurring(req.user.id, id, payload);
        audit(AUDIT.RECURRING_UPDATED, {
            userId: req.user.id, req,
            target: { type: 'RecurringExpense', id: String(item._id) },
            metadata: payload,
        });
        res.status(200).json({ recurring: item });
    } catch (err) {
        if (!handle(res, err)) throw err;
    }
});

export const deleteRecurring = asyncHandler(async (req, res) => {
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'A valid id is required' });

    try {
        const item = await dismissRecurring(req.user.id, id);
        audit(AUDIT.RECURRING_DISMISSED, {
            userId: req.user.id, req,
            target: { type: 'RecurringExpense', id: String(item._id) },
            metadata: { merchantKey: item.merchantKey },
        });
        res.status(200).json({ message: 'Dismissed' });
    } catch (err) {
        if (!handle(res, err)) throw err;
    }
});

/**
 * Run detection on demand.
 *
 * Detection is normally nightly; this exists so a new user doesn't have to wait
 * until tomorrow to see anything on an empty screen. It is rate-limited at the
 * route because it is the only user-triggerable endpoint here that does real
 * aggregation work.
 */
export const postDetect = asyncHandler(async (req, res) => {
    const result = await detectForUser(req.user.id);
    const items = await listRecurring(req.user.id, { status: 'active' });
    res.status(200).json({ ...result, recurring: items });
});
