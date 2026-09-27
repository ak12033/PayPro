import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { LifeBuoy, Plus, ChevronDown } from 'lucide-react';
import PageHeader, { SectionHeading } from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import List, { ListRow } from '../../components/ui/List';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import NewTicketSheet from '../../features/support/NewTicketSheet';
import TicketThread from '../../features/support/TicketThread';
import useQuery from '../../hooks/useQuery';
import { supportApi } from '../../services/api/endpoints/supportApi';
import { getErrorMessage } from '../../utils/errors';
import { formatRelativeTime } from '../../utils/formatters';
import { TICKET_STATUS_LABEL, TICKET_STATUS_TONE } from '../../constants/support';
import cn from '../../lib/cn';

/**
 * Help (plan.md §27).
 *
 * FAQ above tickets, deliberately. Most questions someone arrives with are
 * already answered — "why is my top-up pending", "why was my transfer held" —
 * and answering them here is faster for the user and cheaper than a ticket
 * nobody needed to open. The tickets are right below for when it isn't.
 */
const Support = () => {
    const faq = useQuery(async () => (await supportApi.getFaq()).data?.faq ?? []);
    const tickets = useQuery(async () => (await supportApi.listTickets()).data?.tickets ?? []);

    const [composerOpen, setComposerOpen] = useState(false);
    const [activeTicketId, setActiveTicketId] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [openFaq, setOpenFaq] = useState(null);

    const activeTicket = useQuery(
        async () => (await supportApi.getTicket(activeTicketId)).data?.ticket ?? null,
        { deps: [activeTicketId], enabled: Boolean(activeTicketId) }
    );

    const handleCreate = async (payload) => {
        setSubmitting(true);
        try {
            const { data } = await supportApi.createTicket(payload);
            toast.success(`Ticket ${data.ticket.ticketNumber} opened.`);
            setComposerOpen(false);
            tickets.refresh();
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not open a ticket.'));
        } finally {
            setSubmitting(false);
        }
    };

    const handleReply = async (body) => {
        setSubmitting(true);
        try {
            await supportApi.addMessage(activeTicketId, body);
            activeTicket.refresh();
            tickets.refresh();
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not send your reply.'));
        } finally {
            setSubmitting(false);
        }
    };

    const handleCloseTicket = async () => {
        setSubmitting(true);
        try {
            await supportApi.close(activeTicketId);
            toast.success('Ticket closed.');
            setActiveTicketId(null);
            tickets.refresh();
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not close this ticket.'));
        } finally {
            setSubmitting(false);
        }
    };

    const ticketList = tickets.data ?? [];

    return (
        <>
            <PageHeader
                title="Help"
                subtitle="Answers to common questions, and a way to reach us when they don't cover it."
                back={true}
                action={
                    <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => setComposerOpen(true)}>
                        Get help
                    </Button>
                }
            />

            <div className="space-y-6">
                <section>
                    <SectionHeading title="Common questions" />
                    <Card padding="none">
                        {faq.loading ? (
                            <div className="space-y-2 p-4">
                                <Skeleton className="h-5 w-2/3" />
                                <Skeleton className="h-5 w-1/2" />
                            </div>
                        ) : (
                            <ul className="divide-y divide-border">
                                {(faq.data ?? []).map((entry) => {
                                    const expanded = openFaq === entry.id;
                                    return (
                                        <li key={entry.id}>
                                            <button
                                                type="button"
                                                aria-expanded={expanded}
                                                onClick={() => setOpenFaq(expanded ? null : entry.id)}
                                                className="flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left hover:bg-surface-hover"
                                            >
                                                <span className="text-sm font-medium text-text">{entry.question}</span>
                                                <ChevronDown
                                                    size={16}
                                                    aria-hidden="true"
                                                    className={cn(
                                                        'mt-0.5 shrink-0 text-text-muted transition-transform duration-[--duration-fast]',
                                                        expanded && 'rotate-180'
                                                    )}
                                                />
                                            </button>
                                            {expanded && (
                                                <p className="px-4 pb-4 text-sm leading-6 text-text-muted">
                                                    {entry.answer}
                                                </p>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </Card>
                </section>

                <section>
                    <SectionHeading title="Your tickets" />
                    <Card padding={ticketList.length ? 'none' : 'lg'}>
                        {tickets.error ? (
                            <ErrorState title="Tickets unavailable" message={tickets.error} onRetry={tickets.retry} />
                        ) : tickets.loading ? (
                            <div className="space-y-2 p-4">
                                <Skeleton className="h-12 w-full" />
                                <Skeleton className="h-12 w-full" />
                            </div>
                        ) : ticketList.length ? (
                            <List>
                                {ticketList.map((ticket) => (
                                    <ListRow
                                        key={ticket._id}
                                        title={ticket.subject}
                                        subtitle={`${ticket.ticketNumber} · ${formatRelativeTime(ticket.updatedAt)}`}
                                        onClick={() => setActiveTicketId(ticket._id)}
                                        showChevron
                                        trailing={
                                            <Badge tone={TICKET_STATUS_TONE[ticket.status]} size="sm">
                                                {TICKET_STATUS_LABEL[ticket.status]}
                                            </Badge>
                                        }
                                    />
                                ))}
                            </List>
                        ) : (
                            <EmptyState
                                variant="first-run"
                                icon={<LifeBuoy size={20} />}
                                title="No tickets"
                                description="If something isn't right, open a ticket and we'll look into it."
                                action={
                                    <Button variant="primary" onClick={() => setComposerOpen(true)}>
                                        Get help
                                    </Button>
                                }
                            />
                        )}
                    </Card>
                </section>
            </div>

            <NewTicketSheet
                open={composerOpen}
                onClose={() => setComposerOpen(false)}
                onSubmit={handleCreate}
                submitting={submitting}
            />

            <TicketThread
                open={Boolean(activeTicketId)}
                onClose={() => setActiveTicketId(null)}
                ticket={activeTicket.data}
                loading={activeTicket.loading}
                onReply={handleReply}
                onCloseTicket={handleCloseTicket}
                replying={submitting}
            />
        </>
    );
};

export default Support;
