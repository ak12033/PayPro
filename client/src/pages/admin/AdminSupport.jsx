import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { LifeBuoy } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { SkeletonRows } from '../../components/ui/Skeleton';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import ResponsiveTable from '../../features/admin/ResponsiveTable';
import AgentTicketSheet from '../../features/admin/AgentTicketSheet';
import useQuery from '../../hooks/useQuery';
import { adminApi } from '../../services/api/endpoints/adminApi';
import { getErrorMessage } from '../../utils/errors';
import { formatRelativeTime } from '../../utils/formatters';
import { AGENT_TICKET_STATUS_LABEL } from '../../constants/admin';
import { TICKET_CATEGORY_LABEL, TICKET_STATUS_TONE } from '../../constants/support';
import { personName } from '../../features/admin/personName';

const FILTERS = [
    { value: 'open', label: 'Needs attention' },
    { value: 'awaiting_user', label: 'Waiting on customer' },
    { value: 'resolved', label: 'Resolved' },
    { value: 'all', label: 'All' },
];

/**
 * The support queue (plan.md §28.2 "Support", §27.2).
 *
 * "Needs attention" is the server's `open` filter, which spans new *and*
 * in-progress tickets — everything where the next move is ours.
 */
const AdminSupport = () => {
    const [status, setStatus] = useState('open');
    const [activeId, setActiveId] = useState(null);
    const [busy, setBusy] = useState(false);

    const queue = useQuery(async () => (await adminApi.listTickets({ status })).data, { deps: [status] });
    const active = useQuery(
        async () => (await adminApi.getTicket(activeId)).data?.ticket ?? null,
        { deps: [activeId], enabled: Boolean(activeId) }
    );

    /** Runs one agent action, refreshing both the open ticket and the queue. Returns success. */
    const run = async (action, success, failure) => {
        setBusy(true);
        try {
            await action();
            if (success) toast.success(success);
            active.refresh();
            queue.refresh();
            return true;
        } catch (err) {
            toast.error(getErrorMessage(err, failure));
            return false;
        } finally {
            setBusy(false);
        }
    };

    const tickets = queue.data?.tickets ?? [];

    return (
        <>
            <PageHeader title="Support queue" subtitle="Urgent first, then oldest. Fraud reports are always urgent." />

            <SegmentedControl
                label="Ticket status"
                options={FILTERS}
                value={status}
                onChange={setStatus}
                className="mb-4"
            />

            <Card padding="none">
                {queue.error ? (
                    <ErrorState title="Queue unavailable" message={queue.error} onRetry={queue.retry} reassurance={null} />
                ) : queue.loading ? (
                    <SkeletonRows count={5} />
                ) : tickets.length === 0 ? (
                    <EmptyState
                        variant={status === 'open' ? 'first-run' : 'filtered'}
                        icon={<LifeBuoy size={20} />}
                        title={status === 'open' ? 'Queue is clear' : 'No tickets here'}
                        description={status === 'open' ? 'No customer is waiting on a reply.' : 'No tickets match this filter.'}
                    />
                ) : (
                    <ResponsiveTable
                        caption="Support tickets"
                        rows={tickets}
                        onRowClick={(row) => setActiveId(row._id)}
                        columns={[
                            {
                                key: 'subject',
                                header: 'Ticket',
                                render: (row) => (
                                    <>
                                        <p className="font-medium">{row.subject}</p>
                                        <p className="text-xs text-text-muted">{row.ticketNumber} · {personName(row.userId)}</p>
                                    </>
                                ),
                            },
                            {
                                key: 'category',
                                header: 'Category',
                                render: (row) => (
                                    <span className="flex flex-wrap items-center gap-1.5">
                                        {TICKET_CATEGORY_LABEL[row.category] ?? row.category}
                                        {row.priority === 'urgent' && <Badge tone="negative" size="sm">Urgent</Badge>}
                                    </span>
                                ),
                            },
                            {
                                key: 'status',
                                header: 'Status',
                                render: (row) => (
                                    <Badge tone={TICKET_STATUS_TONE[row.status]} size="sm" dot>
                                        {AGENT_TICKET_STATUS_LABEL[row.status]}
                                    </Badge>
                                ),
                            },
                            {
                                key: 'updated',
                                header: 'Last activity',
                                className: 'text-text-muted',
                                render: (row) => formatRelativeTime(row.updatedAt),
                            },
                        ]}
                        mobileRow={(row) => ({
                            title: row.subject,
                            subtitle: `${row.ticketNumber} · ${personName(row.userId)} · ${formatRelativeTime(row.updatedAt)}`,
                            trailing: (
                                <Badge tone={row.priority === 'urgent' ? 'negative' : TICKET_STATUS_TONE[row.status]} size="sm">
                                    {row.priority === 'urgent' ? 'Urgent' : AGENT_TICKET_STATUS_LABEL[row.status]}
                                </Badge>
                            ),
                        })}
                    />
                )}
            </Card>

            <AgentTicketSheet
                open={Boolean(activeId)}
                onClose={() => setActiveId(null)}
                ticket={active.data}
                loading={active.loading}
                error={active.error}
                busy={busy}
                onReply={(body) => run(() => adminApi.replyTicket(activeId, body), null, 'Could not send the reply.')}
                onAssign={() => run(() => adminApi.assignTicket(activeId), 'Ticket assigned to you.', 'Could not assign the ticket.')}
                onResolve={() => run(() => adminApi.resolveTicket(activeId), 'Ticket marked resolved.', 'Could not resolve the ticket.')}
            />
        </>
    );
};

export default AdminSupport;
