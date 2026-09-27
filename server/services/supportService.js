import crypto from 'crypto';
import SupportTicket from '../models/SupportTicket.js';
import RiskCase from '../models/RiskCase.js';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import { notifyUser } from './notificationService.js';
import { audit } from './auditService.js';
import { AUDIT } from '../models/AuditLog.js';
import logger from '../utils/logger.js';

/**
 * Support tickets (plan.md §27).
 *
 * Two rules this module enforces rather than merely documents:
 *
 *   - A fraud report escalates to `urgent`, writes an audit entry and opens a
 *     `RiskCase` (§27.3). Someone reporting fraud should not wait behind a
 *     password-reset question.
 *   - Nothing here resolves a dispute or promises a refund (§27.4). There is no
 *     status that means "refund approved" and no path from a ticket to the
 *     ledger; an agent who wants to refund must go through the refund flow,
 *     which is audited on its own terms.
 */

export class SupportError extends Error {
    constructor(code, message, status = 400) {
        super(message);
        this.name = 'SupportError';
        this.code = code;
        this.status = status;
    }
}

/** Bounded so an embedded thread cannot grow without limit. */
export const MAX_MESSAGES = 100;

const OPEN_STATUSES = ['open', 'awaiting_user', 'in_progress'];

/**
 * A short, human-quotable reference: `PP-<6 base32 chars>`.
 *
 * Crockford-style alphabet minus I/L/O/U — the characters people misread when
 * reading a code aloud or typing it back. ~1e9 values, and `createTicket`
 * retries on the unique-index collision rather than pretending it cannot happen.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const generateTicketNumber = () => {
    const bytes = crypto.randomBytes(6);
    let out = '';
    for (let i = 0; i < 6; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
    return `PP-${out}`;
};

export const listTickets = (userId, { status } = {}) => {
    const query = { userId };
    if (status === 'open') query.status = { $in: OPEN_STATUSES };
    else if (status) query.status = status;
    return SupportTicket.find(query)
        .sort({ createdAt: -1 })
        .select('-messages')
        .limit(100)
        .lean();
};

export const getTicket = async (userId, ticketId) => {
    const ticket = await SupportTicket.findOne({ _id: ticketId, userId }).lean();
    if (!ticket) throw new SupportError('NOT_FOUND', 'Ticket not found', 404);
    return ticket;
};

export const createTicket = async (userId, { category, subject, body, relatedTransactionId = null, req } = {}) => {
    if (relatedTransactionId) {
        const owned = await Transaction.exists({ _id: relatedTransactionId, userId });
        if (!owned) throw new SupportError('TRANSACTION_NOT_FOUND', 'That transaction does not exist', 404);
    }

    const isFraud = category === 'fraud';

    let ticket = null;
    // Three attempts: at 1e9 possible values a collision is already unlikely,
    // and three independent draws makes it negligible without an unbounded loop.
    for (let attempt = 0; attempt < 3 && !ticket; attempt += 1) {
        try {
            ticket = await SupportTicket.create({
                userId,
                ticketNumber: generateTicketNumber(),
                category,
                subject,
                priority: isFraud ? 'urgent' : 'normal',
                relatedTransactionId,
                messages: [{ author: 'user', authorId: userId, body, at: new Date() }],
            });
        } catch (err) {
            if (err.code !== 11000) throw err;
        }
    }
    if (!ticket) throw new SupportError('TICKET_NUMBER_COLLISION', 'Could not create a ticket, please try again', 503);

    audit(AUDIT.SUPPORT_TICKET_CREATED, {
        userId, req,
        target: { type: 'SupportTicket', id: String(ticket._id) },
        metadata: { category, ticketNumber: ticket.ticketNumber, priority: ticket.priority },
    });

    /**
     * Fraud auto-escalation (§27.3). The risk case carries no transaction
     * assessment — it exists so a human sees the report in the same queue as
     * machine-detected risk, rather than only in a support inbox someone has to
     * remember to check.
     */
    if (isFraud) {
        audit(AUDIT.SUPPORT_FRAUD_REPORTED, {
            userId, req,
            target: { type: 'SupportTicket', id: String(ticket._id) },
            metadata: { ticketNumber: ticket.ticketNumber, relatedTransactionId: String(relatedTransactionId || '') },
        });

        try {
            const riskCase = await RiskCase.create({
                userId,
                transactionId: relatedTransactionId,
                // A user-reported case carries no computed score. Recording 0
                // would read as "assessed and found safe", which is the opposite
                // of what a fraud report means — so the urgent priority, not the
                // score, is what puts it at the top of the queue.
                score: 0,
                intent: { kind: 'other' },
                rules: [{ code: 'USER_REPORTED_FRAUD', weight: 0, detail: subject }],
                action: 'hold',
                priority: 'urgent',
                // No deadline: a user-reported case must be seen by a person,
                // not aged out by a timer. Nothing is held, so nothing is stranded.
                autoReleaseAt: null,
            });
            ticket.relatedRiskCaseId = riskCase._id;
            await ticket.save();
        } catch (err) {
            // A failed escalation must not lose the ticket the user just filed.
            logger.error('Fraud ticket risk-case escalation failed', {
                ticketId: String(ticket._id), error: err.message,
            });
        }

        const reviewers = await User.find({ role: { $in: ['admin', 'risk', 'support'] }, status: 'active' })
            .select('_id').lean();
        await Promise.allSettled(reviewers.map((reviewer) => notifyUser(
            reviewer._id, 'Support', 'Fraud reported',
            `Ticket ${ticket.ticketNumber}: ${subject}`,
            { ticketId: String(ticket._id), ticketNumber: ticket.ticketNumber },
            { dedupeKey: `support-fraud:${ticket._id}` }
        )));
    }

    return ticket;
};

/**
 * Append a message.
 *
 * `author` is derived from who is calling, never from the request body — a user
 * must not be able to post a message that renders as coming from an agent.
 */
export const addMessage = async ({ ticketId, actorId, author, body, req }) => {
    const query = author === 'user' ? { _id: ticketId, userId: actorId } : { _id: ticketId };
    const ticket = await SupportTicket.findOne(query);
    if (!ticket) throw new SupportError('NOT_FOUND', 'Ticket not found', 404);
    if (['resolved', 'closed'].includes(ticket.status)) {
        throw new SupportError('TICKET_CLOSED', 'This ticket is closed. Please open a new one.', 409);
    }
    if (ticket.messages.length >= MAX_MESSAGES) {
        throw new SupportError('THREAD_FULL', 'This conversation has reached its length limit. Please open a new ticket.', 409);
    }

    ticket.messages.push({ author, authorId: actorId, body, at: new Date() });

    /**
     * Status follows the conversation: an agent reply puts the ball in the
     * user's court and vice versa. Without this the queue cannot distinguish
     * "waiting on us" from "waiting on them", which is the only question an
     * agent triaging a list actually needs answered.
     */
    if (author === 'agent') ticket.status = 'awaiting_user';
    else if (author === 'user' && ticket.status === 'awaiting_user') ticket.status = 'in_progress';

    await ticket.save();

    audit(AUDIT.SUPPORT_TICKET_MESSAGE, {
        userId: actorId, req,
        target: { type: 'SupportTicket', id: String(ticket._id) },
        metadata: { author, ticketNumber: ticket.ticketNumber },
    });

    if (author === 'agent') {
        await notifyUser(
            ticket.userId, 'Support', 'Support replied',
            `There's a new reply on ticket ${ticket.ticketNumber}.`,
            { ticketId: String(ticket._id), ticketNumber: ticket.ticketNumber }
        ).catch(() => {});
    }

    return ticket;
};

export const closeTicket = async ({ ticketId, actorId, byAgent = false, req }) => {
    const query = byAgent ? { _id: ticketId } : { _id: ticketId, userId: actorId };
    const ticket = await SupportTicket.findOne(query);
    if (!ticket) throw new SupportError('NOT_FOUND', 'Ticket not found', 404);
    if (ticket.status === 'closed') return ticket;

    ticket.status = byAgent ? 'resolved' : 'closed';
    ticket.resolvedAt = new Date();
    ticket.messages.push({
        author: 'system',
        body: byAgent ? 'Marked resolved by support.' : 'Closed by the account holder.',
        at: new Date(),
    });
    await ticket.save();

    audit(AUDIT.SUPPORT_TICKET_CLOSED, {
        userId: actorId, req,
        target: { type: 'SupportTicket', id: String(ticket._id) },
        metadata: { ticketNumber: ticket.ticketNumber, byAgent },
    });

    if (byAgent) {
        await notifyUser(
            ticket.userId, 'Support', 'Ticket resolved',
            `Ticket ${ticket.ticketNumber} has been marked resolved. Reply if it isn't sorted.`,
            { ticketId: String(ticket._id) }
        ).catch(() => {});
    }

    return ticket;
};

// ---------------------------------------------------------------------------
// Agent side
// ---------------------------------------------------------------------------

/** Lowest to highest. The array index is the sort rank. */
export const PRIORITY_ORDER = ['low', 'normal', 'high', 'urgent'];

/**
 * The agent queue: most urgent first, then oldest first.
 *
 * `priority` is a string enum, and `.sort({ priority: -1 })` sorted it
 * alphabetically — urgent → normal → low → **high**. Urgent (every fraud report)
 * still came first, which is why nobody noticed; `high` tickets came last. The
 * rank is derived from `PRIORITY_ORDER` inside the aggregation rather than
 * stored, so no existing ticket needs a backfill and a stored rank can never
 * disagree with the label next to it.
 */
export const listQueue = async ({ status = 'open', limit = 50, page = 1 } = {}) => {
    const query = status === 'open' ? { status: { $in: OPEN_STATUSES } } : status === 'all' ? {} : { status };
    const [ranked, total] = await Promise.all([
        SupportTicket.aggregate([
            { $match: query },
            { $addFields: { priorityRank: { $indexOfArray: [PRIORITY_ORDER, '$priority'] } } },
            { $sort: { priorityRank: -1, createdAt: 1 } },
            { $skip: (page - 1) * limit },
            { $limit: limit },
            { $project: { messages: 0, priorityRank: 0 } },
        ]),
        SupportTicket.countDocuments(query),
    ]);
    const tickets = await SupportTicket.populate(ranked, { path: 'userId', select: 'firstName lastName email' });
    return { tickets, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) };
};

export const getTicketForAgent = async (ticketId) => {
    const ticket = await SupportTicket.findById(ticketId)
        .populate('userId', 'firstName lastName email')
        .populate('assignedTo', 'firstName lastName email')
        .lean();
    if (!ticket) throw new SupportError('NOT_FOUND', 'Ticket not found', 404);
    return ticket;
};

export const assignTicket = async ({ ticketId, agentId, req }) => {
    const ticket = await SupportTicket.findByIdAndUpdate(
        ticketId,
        { $set: { assignedTo: agentId, status: 'in_progress' } },
        { new: true }
    );
    if (!ticket) throw new SupportError('NOT_FOUND', 'Ticket not found', 404);

    audit(AUDIT.SUPPORT_TICKET_ASSIGNED, {
        userId: agentId, req,
        target: { type: 'SupportTicket', id: String(ticket._id) },
        metadata: { ticketNumber: ticket.ticketNumber },
    });
    return ticket;
};

/**
 * Static help content (plan.md §27.2's `GET /api/support/faq`, no auth).
 *
 * Held here as data rather than in a CMS because there is no CMS; the point is
 * that the assistant and the help screen answer from the *same* source, so a
 * user cannot be told two different things about a refund window.
 */
export const FAQ = [
    {
        id: 'topup-not-credited',
        category: 'payment',
        question: 'I topped up but my balance has not changed',
        answer: 'A top-up shows as Pending until your bank confirms it, which is usually seconds but can take a few minutes. If it is still pending after 30 minutes, or shows as Failed while your bank shows a debit, open a ticket with the transaction attached — any money taken for a failed top-up is returned by the payment provider.',
    },
    {
        id: 'transfer-held',
        category: 'security',
        question: 'Why was my transfer held for review?',
        answer: 'Some transfers are held automatically when they look unusual for your account — a much larger amount than normal, a first transfer to a new recipient, or several transfers in quick succession. No money moves while a transfer is held. Most holds clear within 24 hours, and you can send the transfer again once it does.',
    },
    {
        id: 'wrong-recipient',
        category: 'transaction',
        question: 'I sent money to the wrong person',
        answer: 'A completed transfer cannot be reversed by PayPro — the money is in the recipient\'s wallet and only they can send it back. Contact them first. If you believe you were deceived, report it as fraud from the transaction and we will review it.',
    },
    {
        id: 'category-wrong',
        category: 'transaction',
        question: 'A transaction is in the wrong category',
        answer: 'Open the transaction and choose a different category. Your correction is kept and is never overwritten by automatic categorisation, and your budget updates immediately.',
    },
    {
        id: 'recurring-cancel',
        category: 'account',
        question: 'Can PayPro cancel a subscription for me?',
        answer: 'No. PayPro can spot payments that look recurring so you know what to expect, but it cannot cancel anything on your behalf — you need to cancel with the merchant directly.',
    },
    {
        id: 'close-account',
        category: 'account',
        question: 'How do I close my account?',
        answer: 'Account > Data & privacy > Close account. Withdraw or spend your balance first. Your transaction records are kept, in a form no longer linked to your name, because financial records must be retained.',
    },
    {
        id: 'not-a-credit-score',
        category: 'account',
        question: 'Is my financial health score a credit score?',
        answer: 'No. It is PayPro\'s own measure of how your money is tracking, computed only from your activity here. No lender sees it and it has no effect on any credit application.',
    },
];

export default {
    listTickets, getTicket, createTicket, addMessage, closeTicket,
    listQueue, getTicketForAgent, assignTicket, FAQ, SupportError,
};
