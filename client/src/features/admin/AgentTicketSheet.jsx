import React, { useEffect, useState } from 'react';
import { Send, UserCheck, CheckCircle2 } from 'lucide-react';
import Sheet from '../../components/ui/Sheet';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import { DetailRow } from '../../components/ui/List';
import cn from '../../lib/cn';
import { personName } from './personName';
import { formatDateTime } from '../../utils/formatters';
import { useAuth } from '../../context/AuthContext';
import { AGENT_TICKET_STATUS_LABEL } from '../../constants/admin';
import { TICKET_CATEGORY_LABEL, TICKET_STATUS_TONE } from '../../constants/support';

const name = (person) => personName(person, null);

/**
 * A ticket from the agent's side of the conversation.
 *
 * Deliberately not `features/support/TicketThread.jsx` with a flag: that
 * component speaks to the customer ("You", "PayPro support", "Your reply
 * needed"), and an agent reading "You" on the customer's own messages is how
 * a reply gets written to the wrong person. Here the customer is named and the
 * agent's own side is "Support".
 *
 * A fraud report carries a linked risk case; that link is surfaced first,
 * because the right next step for one of those is usually the risk queue, not
 * a reply.
 */
const AgentTicketSheet = ({ open, onClose, ticket, loading, error, onReply, onAssign, onResolve, busy }) => {
    const { user } = useAuth();
    const [reply, setReply] = useState('');

    useEffect(() => {
        if (!open) setReply('');
    }, [open]);

    const finished = ticket && ['resolved', 'closed'].includes(ticket.status);
    const assignedToMe = ticket?.assignedTo && String(ticket.assignedTo._id) === String(user?._id);

    const send = async () => {
        const body = reply.trim();
        if (!body) return;
        const ok = await onReply(body);
        if (ok) setReply('');
    };

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title={ticket ? ticket.subject : 'Ticket'}
            description={ticket ? `${ticket.ticketNumber} · ${name(ticket.userId) ?? 'Unknown customer'}` : undefined}
            size="lg"
            footer={
                ticket && !finished ? (
                    <div className="space-y-2">
                        <textarea
                            value={reply}
                            onChange={(event) => setReply(event.target.value)}
                            rows={3}
                            maxLength={4000}
                            placeholder="Reply to the customer…"
                            aria-label="Reply to the customer"
                            className="w-full rounded-control border border-border bg-surface px-3 py-2.5 text-sm text-text focus:border-accent"
                        />
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                            <div className="flex flex-col gap-2 sm:flex-row">
                                {!assignedToMe && (
                                    <Button variant="secondary" size="sm" icon={<UserCheck size={14} />} onClick={onAssign} disabled={busy}>
                                        Take this ticket
                                    </Button>
                                )}
                                <Button variant="secondary" size="sm" icon={<CheckCircle2 size={14} />} onClick={onResolve} disabled={busy}>
                                    Mark resolved
                                </Button>
                            </div>
                            <Button
                                variant="primary"
                                size="sm"
                                icon={<Send size={14} />}
                                onClick={send}
                                loading={busy}
                                disabled={!reply.trim()}
                            >
                                Send reply
                            </Button>
                        </div>
                    </div>
                ) : null
            }
        >
            {error ? (
                <p role="alert" className="py-6 text-center text-sm text-danger">{error}</p>
            ) : loading || !ticket ? (
                <div className="grid place-items-center py-10"><Spinner /></div>
            ) : (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={TICKET_STATUS_TONE[ticket.status]} dot>{AGENT_TICKET_STATUS_LABEL[ticket.status]}</Badge>
                        <Badge tone="neutral">{TICKET_CATEGORY_LABEL[ticket.category] ?? ticket.category}</Badge>
                        {['urgent', 'high'].includes(ticket.priority) && (
                            <Badge tone="negative">{ticket.priority === 'urgent' ? 'Urgent' : 'High priority'}</Badge>
                        )}
                    </div>

                    {ticket.relatedRiskCaseId && (
                        <p className="rounded-control bg-warning-soft px-3 py-2.5 text-xs leading-5 text-warning">
                            Reported as fraud. A risk case was opened automatically — check the risk queue before replying.
                        </p>
                    )}

                    <dl className="divide-y divide-border">
                        <DetailRow label="Customer" value={`${name(ticket.userId) ?? '—'} (${ticket.userId?.email ?? '—'})`} />
                        <DetailRow label="Opened" value={formatDateTime(ticket.createdAt)} />
                        <DetailRow label="Assigned to" value={assignedToMe ? 'You' : name(ticket.assignedTo) ?? 'Nobody yet'} />
                    </dl>

                    <ul className="space-y-3" aria-label="Conversation">
                        {ticket.messages.map((message, index) => (
                            <li
                                key={index}
                                className={cn(
                                    'max-w-[85%] rounded-card px-3 py-2.5',
                                    message.author === 'agent' && 'ml-auto bg-accent-soft',
                                    message.author === 'user' && 'bg-surface-sunken',
                                    message.author === 'system' && 'mx-auto bg-transparent text-center'
                                )}
                            >
                                {message.author !== 'system' && (
                                    <p className="text-2xs font-medium uppercase tracking-wide text-text-muted">
                                        {message.author === 'agent' ? 'Support' : name(ticket.userId) ?? 'Customer'}
                                    </p>
                                )}
                                <p
                                    className={cn(
                                        'whitespace-pre-wrap text-sm leading-6',
                                        message.author === 'system' ? 'text-xs text-text-muted' : 'mt-1 text-text'
                                    )}
                                >
                                    {message.body}
                                </p>
                                {message.author !== 'system' && (
                                    <p className="mt-1 text-2xs text-text-muted">{formatDateTime(message.at)}</p>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </Sheet>
    );
};

export default AgentTicketSheet;
