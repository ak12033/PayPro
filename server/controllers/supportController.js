import { asyncHandler } from '../utils/asyncHandler.js';
import { asObjectId, asEnum, asString } from '../utils/sanitize.js';
import {
    listTickets,
    getTicket,
    createTicket,
    addMessage,
    closeTicket,
    listQueue,
    getTicketForAgent,
    assignTicket,
    FAQ,
    SupportError,
} from '../services/supportService.js';

const CATEGORIES = ['transaction', 'payment', 'account', 'security', 'fraud', 'other'];
const STATUSES = ['open', 'awaiting_user', 'in_progress', 'resolved', 'closed', 'all'];

const handle = (res, err) => {
    if (err instanceof SupportError) {
        res.status(err.status).json({ message: err.message });
        return true;
    }
    return false;
};

// ---------------------------------------------------------------------------
// User-facing
// ---------------------------------------------------------------------------

/** Static help content. Unauthenticated by design (plan.md §27.2). */
export const getFaq = asyncHandler(async (req, res) => {
    res.status(200).json({ faq: FAQ });
});

export const getTickets = asyncHandler(async (req, res) => {
    const status = asEnum(req.query.status, STATUSES);
    res.status(200).json({ tickets: await listTickets(req.user.id, { status }) });
});

export const postTicket = asyncHandler(async (req, res) => {
    const category = asEnum(req.body?.category, CATEGORIES);
    if (!category) return res.status(400).json({ message: 'Pick what this is about' });

    const subject = asString(req.body?.subject, { maxLength: 140 });
    if (!subject) return res.status(400).json({ message: 'A subject is required' });

    const body = asString(req.body?.body, { maxLength: 4000 });
    if (!body) return res.status(400).json({ message: 'Tell us what happened' });

    const relatedTransactionId = req.body?.relatedTransactionId
        ? asObjectId(req.body.relatedTransactionId)
        : null;
    if (req.body?.relatedTransactionId && !relatedTransactionId) {
        return res.status(400).json({ message: 'A valid transaction id is required' });
    }

    try {
        const ticket = await createTicket(req.user.id, {
            category, subject, body, relatedTransactionId, req,
        });
        res.status(201).json({ ticket });
    } catch (err) {
        if (!handle(res, err)) throw err;
    }
});

export const getTicketById = asyncHandler(async (req, res) => {
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'A valid ticket id is required' });

    try {
        res.status(200).json({ ticket: await getTicket(req.user.id, id) });
    } catch (err) {
        if (!handle(res, err)) throw err;
    }
});

export const postTicketMessage = asyncHandler(async (req, res) => {
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'A valid ticket id is required' });

    const body = asString(req.body?.body, { maxLength: 4000 });
    if (!body) return res.status(400).json({ message: 'A message is required' });

    try {
        // `author: 'user'` is fixed here, never taken from the body — a user
        // must not be able to post a message that renders as support.
        const ticket = await addMessage({ ticketId: id, actorId: req.user.id, author: 'user', body, req });
        res.status(200).json({ ticket });
    } catch (err) {
        if (!handle(res, err)) throw err;
    }
});

export const postTicketClose = asyncHandler(async (req, res) => {
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'A valid ticket id is required' });

    try {
        const ticket = await closeTicket({ ticketId: id, actorId: req.user.id, byAgent: false, req });
        res.status(200).json({ ticket });
    } catch (err) {
        if (!handle(res, err)) throw err;
    }
});

// ---------------------------------------------------------------------------
// Agent-facing. Mounted under /api/admin/support with requireRole('support','admin').
// ---------------------------------------------------------------------------

export const getSupportQueue = asyncHandler(async (req, res) => {
    const status = asEnum(req.query.status, STATUSES) || 'open';
    res.status(200).json(await listQueue({ status }));
});

export const getQueueTicket = asyncHandler(async (req, res) => {
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'A valid ticket id is required' });

    try {
        res.status(200).json({ ticket: await getTicketForAgent(id) });
    } catch (err) {
        if (!handle(res, err)) throw err;
    }
});

export const postAgentReply = asyncHandler(async (req, res) => {
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'A valid ticket id is required' });

    const body = asString(req.body?.body, { maxLength: 4000 });
    if (!body) return res.status(400).json({ message: 'A message is required' });

    try {
        const ticket = await addMessage({ ticketId: id, actorId: req.user.id, author: 'agent', body, req });
        res.status(200).json({ ticket });
    } catch (err) {
        if (!handle(res, err)) throw err;
    }
});

export const postAgentAssign = asyncHandler(async (req, res) => {
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'A valid ticket id is required' });

    try {
        res.status(200).json({ ticket: await assignTicket({ ticketId: id, agentId: req.user.id, req }) });
    } catch (err) {
        if (!handle(res, err)) throw err;
    }
});

export const postAgentResolve = asyncHandler(async (req, res) => {
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'A valid ticket id is required' });

    try {
        const ticket = await closeTicket({ ticketId: id, actorId: req.user.id, byAgent: true, req });
        res.status(200).json({ ticket });
    } catch (err) {
        if (!handle(res, err)) throw err;
    }
});
