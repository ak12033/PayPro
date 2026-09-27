import { describe, it, expect, vi } from 'vitest';
import mongoose from 'mongoose';
import User from '../models/User.js';
import SupportTicket from '../models/SupportTicket.js';
import RiskCase from '../models/RiskCase.js';
import Transaction from '../models/Transaction.js';
import AuditLog, { AUDIT } from '../models/AuditLog.js';
import {
    createTicket,
    addMessage,
    closeTicket,
    listTickets,
    getTicket,
    listQueue,
    FAQ,
} from '../services/supportService.js';

vi.mock('../utils/socket.js', () => ({ emitToUser: vi.fn(), getIO: vi.fn(), initSocket: vi.fn(), default: {} }));
vi.mock('../utils/fcm.js', () => ({ sendPushNotification: vi.fn().mockResolvedValue({ success: true, failedTokens: [] }), default: {} }));

const makeUser = (role = 'user') => User.create({
    firstName: 'Asker', email: `s${new mongoose.Types.ObjectId()}@example.com`, password: 'hashed', role,
});

const basic = { category: 'account', subject: 'Cannot change my email', body: 'It keeps failing.' };

describe('supportService — tickets', () => {
    it('creates a ticket with a human-quotable reference and the first message', async () => {
        const user = await makeUser();

        const ticket = await createTicket(user._id, basic);

        expect(ticket.ticketNumber).toMatch(/^PP-[0-9A-HJKMNP-TV-Z]{6}$/);
        expect(ticket.status).toBe('open');
        expect(ticket.priority).toBe('normal');
        expect(ticket.messages).toHaveLength(1);
        expect(ticket.messages[0].author).toBe('user');
    });

    it('refuses to attach a transaction belonging to someone else', async () => {
        const user = await makeUser();
        const stranger = await makeUser();
        const theirs = await Transaction.create({
            userId: stranger._id, description: 'Theirs', amount: 100, type: 'Debit',
            category: 'Food', invoiceId: `INV-SUP-${Date.now()}`, status: 'SUCCESS', settlement: 'settled',
        });

        await expect(createTicket(user._id, { ...basic, relatedTransactionId: theirs._id }))
            .rejects.toMatchObject({ code: 'TRANSACTION_NOT_FOUND' });
    });

    it('only lists the caller’s own tickets', async () => {
        const user = await makeUser();
        const other = await makeUser();
        await createTicket(user._id, basic);
        await createTicket(other._id, basic);

        expect(await listTickets(user._id)).toHaveLength(1);
    });

    it('refuses to read another user’s ticket', async () => {
        const user = await makeUser();
        const other = await makeUser();
        const ticket = await createTicket(other._id, basic);

        await expect(getTicket(user._id, ticket._id)).rejects.toMatchObject({ status: 404 });
    });
});

describe('supportService — fraud auto-escalation (plan.md §27.3)', () => {
    it('escalates to urgent, audits, and opens a risk case', async () => {
        const user = await makeUser();

        const ticket = await createTicket(user._id, {
            category: 'fraud', subject: 'Someone used my account', body: 'I did not make this transfer.',
        });

        expect(ticket.priority).toBe('urgent');
        expect(ticket.relatedRiskCaseId).toBeTruthy();

        const riskCase = await RiskCase.findById(ticket.relatedRiskCaseId);
        expect(riskCase.priority).toBe('urgent');
        expect(riskCase.rules[0].code).toBe('USER_REPORTED_FRAUD');
        // A user-reported case must be seen by a person, never aged out.
        expect(riskCase.autoReleaseAt).toBeNull();

        expect(await AuditLog.findOne({ action: AUDIT.SUPPORT_FRAUD_REPORTED })).toBeTruthy();
    });

    it('notifies every reviewer, once', async () => {
        const user = await makeUser();
        await makeUser('risk');
        await makeUser('support');

        await createTicket(user._id, { category: 'fraud', subject: 'Fraud', body: 'Help' });

        const Notification = (await import('../models/Notification.js')).default;
        const notifications = await Notification.find({ type: 'Support' });
        expect(notifications).toHaveLength(2);
    });
});

describe('supportService — the thread', () => {
    it('an agent reply moves the ticket to awaiting_user, a user reply moves it back', async () => {
        const user = await makeUser();
        const agent = await makeUser('support');
        const ticket = await createTicket(user._id, basic);

        const afterAgent = await addMessage({ ticketId: ticket._id, actorId: agent._id, author: 'agent', body: 'Looking into it' });
        expect(afterAgent.status).toBe('awaiting_user');

        const afterUser = await addMessage({ ticketId: ticket._id, actorId: user._id, author: 'user', body: 'Thanks' });
        expect(afterUser.status).toBe('in_progress');
    });

    it('a user cannot post into a ticket that is not theirs', async () => {
        const owner = await makeUser();
        const stranger = await makeUser();
        const ticket = await createTicket(owner._id, basic);

        await expect(addMessage({ ticketId: ticket._id, actorId: stranger._id, author: 'user', body: 'hi' }))
            .rejects.toMatchObject({ status: 404 });
    });

    it('refuses new messages on a closed ticket', async () => {
        const user = await makeUser();
        const ticket = await createTicket(user._id, basic);
        await closeTicket({ ticketId: ticket._id, actorId: user._id, byAgent: false });

        await expect(addMessage({ ticketId: ticket._id, actorId: user._id, author: 'user', body: 'more' }))
            .rejects.toMatchObject({ code: 'TICKET_CLOSED', status: 409 });
    });

    it('records who closed it, and how', async () => {
        const user = await makeUser();
        const agent = await makeUser('support');

        const byUser = await createTicket(user._id, basic);
        const closed = await closeTicket({ ticketId: byUser._id, actorId: user._id, byAgent: false });
        expect(closed.status).toBe('closed');

        const byAgentTicket = await createTicket(user._id, basic);
        const resolved = await closeTicket({ ticketId: byAgentTicket._id, actorId: agent._id, byAgent: true });
        expect(resolved.status).toBe('resolved');
        expect(resolved.messages.at(-1).author).toBe('system');
    });
});

describe('supportService — the agent queue', () => {
    it('sorts urgent before normal, then oldest first', async () => {
        const a = await makeUser();
        const b = await makeUser();

        await createTicket(a._id, basic);
        await createTicket(b._id, { category: 'fraud', subject: 'Fraud', body: 'Urgent' });

        const { tickets } = await listQueue({ status: 'open' });

        expect(tickets[0].priority).toBe('urgent');
        expect(tickets).toHaveLength(2);
        // The queue view never ships the thread body.
        expect(tickets[0].messages).toBeUndefined();
    });
});

describe('supportService — FAQ (plan.md §27.4)', () => {
    it('never promises an outcome the product cannot deliver', () => {
        const cancel = FAQ.find((f) => f.id === 'recurring-cancel');
        expect(cancel.answer).toMatch(/^No\./);

        const wrongRecipient = FAQ.find((f) => f.id === 'wrong-recipient');
        expect(wrongRecipient.answer).toMatch(/cannot be reversed/i);

        const score = FAQ.find((f) => f.id === 'not-a-credit-score');
        expect(score.answer).toMatch(/^No\./);
    });

    it('every entry has an id, a category, a question and an answer', () => {
        for (const entry of FAQ) {
            expect(entry.id).toBeTruthy();
            expect(entry.category).toBeTruthy();
            expect(entry.question).toBeTruthy();
            expect(entry.answer).toBeTruthy();
        }
    });
});
