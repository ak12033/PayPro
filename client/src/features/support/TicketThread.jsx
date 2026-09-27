import React, { useState } from 'react';
import { Send } from 'lucide-react';
import Sheet from '../../components/ui/Sheet';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import cn from '../../lib/cn';
import { formatDateTime } from '../../utils/formatters';
import { TICKET_STATUS_LABEL, TICKET_STATUS_TONE } from '../../constants/support';

/**
 * One support conversation.
 *
 * Authorship is styled, not just labelled: a user's own messages sit right and
 * tinted, an agent's left, and a system note is visually neither. Someone
 * scanning a thread for "what did support actually say" should not have to read
 * a byline on every message to find it.
 */
const TicketThread = ({ open, onClose, ticket, loading, onReply, onCloseTicket, replying }) => {
    const [reply, setReply] = useState('');
    const closed = ticket && ['resolved', 'closed'].includes(ticket.status);

    const handleReply = async () => {
        const body = reply.trim();
        if (!body) return;
        await onReply(body);
        setReply('');
    };

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title={ticket ? ticket.subject : 'Ticket'}
            description={ticket ? `Reference ${ticket.ticketNumber}` : undefined}
            size="md"
            footer={
                ticket && !closed ? (
                    <div className="space-y-2">
                        <textarea
                            value={reply}
                            onChange={(e) => setReply(e.target.value)}
                            rows={3}
                            maxLength={4000}
                            placeholder="Add a reply…"
                            aria-label="Your reply"
                            className="w-full rounded-control border border-border bg-surface px-3 py-2.5 text-sm text-text focus:border-accent"
                        />
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                            <Button variant="secondary" size="sm" onClick={onCloseTicket} disabled={replying}>
                                Close this ticket
                            </Button>
                            <Button
                                variant="primary"
                                size="sm"
                                icon={<Send size={14} />}
                                onClick={handleReply}
                                loading={replying}
                                disabled={!reply.trim()}
                            >
                                Send reply
                            </Button>
                        </div>
                    </div>
                ) : null
            }
        >
            {loading || !ticket ? (
                <div className="grid place-items-center py-10">
                    <Spinner />
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={TICKET_STATUS_TONE[ticket.status]} size="sm">
                            {TICKET_STATUS_LABEL[ticket.status]}
                        </Badge>
                        {ticket.priority === 'urgent' && <Badge tone="negative" size="sm">Urgent</Badge>}
                    </div>

                    <ul className="space-y-3">
                        {ticket.messages.map((message, index) => (
                            <li
                                key={index}
                                className={cn(
                                    'max-w-[85%] rounded-card px-3 py-2.5',
                                    message.author === 'user' && 'ml-auto bg-accent-soft',
                                    message.author === 'agent' && 'bg-surface-sunken',
                                    message.author === 'system' && 'mx-auto bg-transparent text-center'
                                )}
                            >
                                {message.author !== 'system' && (
                                    <p className="text-2xs font-medium uppercase tracking-wide text-text-muted">
                                        {message.author === 'user' ? 'You' : 'PayPro support'}
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

                    {closed && (
                        <p className="rounded-control bg-surface-sunken p-3 text-xs leading-5 text-text-muted">
                            This ticket is closed. If it isn't sorted, open a new one and mention
                            reference {ticket.ticketNumber}.
                        </p>
                    )}
                </div>
            )}
        </Sheet>
    );
};

export default TicketThread;
