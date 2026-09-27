import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Webhook } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { ConfirmSheet } from '../../components/ui/Sheet';
import { SkeletonRows } from '../../components/ui/Skeleton';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import ResponsiveTable, { Pager } from '../../features/admin/ResponsiveTable';
import useQuery from '../../hooks/useQuery';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage } from '../../utils/errors';
import { adminApi } from '../../services/api/endpoints/adminApi';
import { formatDateTime, formatRelativeTime } from '../../utils/formatters';
import { WEBHOOK_STATUS_TONE, can } from '../../constants/admin';

/** Mirrors REPLAYABLE_WEBHOOK_STATUSES in server/services/paymentSettlementService.js. */
const isReplayable = (event) => event.signatureValid && ['received', 'failed'].includes(event.status);

const FILTERS = [
    { value: '', label: 'All' },
    { value: 'failed', label: 'Failed' },
    { value: 'received', label: 'Unprocessed' },
    { value: 'processed', label: 'Processed' },
    { value: 'ignored', label: 'Ignored' },
];

/**
 * Gateway delivery log (plan.md §28.2 "Webhooks").
 *
 * A stuck `received` row or a run of `failed` ones is the signal. An admin can
 * replay one: the stored, signature-verified payload is re-run through the same
 * once-only settlement the live webhook uses, so a replay of an event that did
 * in fact settle changes nothing. Events that already processed, were ignored,
 * or arrived with a bad signature get no button at all.
 *
 * The payload is deliberately not rendered — it carries customer payment
 * details, and nothing an operator does from this screen needs them.
 */
const AdminWebhooks = () => {
    const [status, setStatus] = useState('');
    const [page, setPage] = useState(1);
    const [target, setTarget] = useState(null);
    const [replaying, setReplaying] = useState(false);
    const { user } = useAuth();
    const canReplay = can(user?.role, 'replayWebhooks');

    const events = useQuery(
        async () => (await adminApi.listWebhooks({ status, page })).data,
        { deps: [status, page] }
    );
    const rows = events.data?.events ?? [];

    const replay = async () => {
        setReplaying(true);
        try {
            const { data } = await adminApi.replayWebhook(target._id);
            if (data.outcome === 'failed') toast.error(`Replay failed again: ${data.error}`);
            else toast.success(data.outcome === 'ignored' ? 'Replayed — nothing in it to settle.' : 'Replayed and settled.');
            setTarget(null);
            events.refresh();
        } catch (err) {
            toast.error(getErrorMessage(err, 'The replay did not run.'));
        } finally {
            setReplaying(false);
        }
    };

    return (
        <>
            <PageHeader title="Webhooks" subtitle="Every Razorpay delivery, deduplicated. Newest first." />

            <SegmentedControl
                label="Delivery status"
                options={FILTERS}
                value={status}
                onChange={(next) => { setStatus(next); setPage(1); }}
                className="mb-4"
            />

            <Card padding="none">
                {events.error ? (
                    <ErrorState title="Delivery log unavailable" message={events.error} onRetry={events.retry} reassurance={null} />
                ) : events.loading ? (
                    <SkeletonRows count={6} />
                ) : rows.length === 0 ? (
                    <EmptyState
                        variant="filtered"
                        icon={<Webhook size={20} />}
                        title="No deliveries"
                        description={status ? 'No deliveries with this status.' : 'No webhook has been received yet.'}
                    />
                ) : (
                    <>
                        <ResponsiveTable
                            caption="Webhook deliveries"
                            rows={rows}
                            columns={[
                                { key: 'type', header: 'Event', render: (row) => <code className="text-xs">{row.eventType ?? 'unknown'}</code> },
                                {
                                    key: 'status',
                                    header: 'Status',
                                    render: (row) => (
                                        <span className="flex flex-wrap gap-1.5">
                                            <Badge tone={WEBHOOK_STATUS_TONE[row.status]} size="sm" dot>{row.status}</Badge>
                                            {!row.signatureValid && <Badge tone="negative" size="sm">Bad signature</Badge>}
                                        </span>
                                    ),
                                },
                                { key: 'error', header: 'Error', className: 'max-w-xs truncate text-text-muted', render: (row) => row.error || '—' },
                                { key: 'received', header: 'Received', className: 'text-text-muted', render: (row) => formatDateTime(row.createdAt) },
                                ...(canReplay ? [{
                                    key: 'action',
                                    header: <span className="sr-only">Actions</span>,
                                    className: 'text-right',
                                    render: (row) => <ReplayButton event={row} onClick={setTarget} />,
                                }] : []),
                            ]}
                            mobileRow={(row) => ({
                                title: row.eventType ?? 'unknown',
                                subtitle: row.error || formatRelativeTime(row.createdAt),
                                trailing: canReplay && isReplayable(row)
                                    ? <ReplayButton event={row} onClick={setTarget} />
                                    : <Badge tone={WEBHOOK_STATUS_TONE[row.status]} size="sm">{row.status}</Badge>,
                            })}
                        />
                        <Pager page={events.data.currentPage} totalPages={events.data.totalPages} total={events.data.total} onChange={setPage} />
                    </>
                )}
            </Card>

            <ConfirmSheet
                open={Boolean(target)}
                onClose={() => setTarget(null)}
                onConfirm={replay}
                loading={replaying}
                variant="primary"
                title="Replay this delivery?"
                description={target
                    ? `The stored ${target.eventType ?? 'event'} is processed again. If it already settled, nothing changes; if it did not, the wallet is updated now.${target.replayCount ? ` It has been replayed ${target.replayCount} time${target.replayCount === 1 ? '' : 's'} before.` : ''}`
                    : ''}
                confirmLabel="Replay"
            />
        </>
    );
};

const ReplayButton = ({ event, onClick }) => (isReplayable(event) ? (
    <button
        type="button"
        onClick={() => onClick(event)}
        className="rounded-control px-2.5 py-1.5 text-xs font-medium text-accent-text hover:bg-accent-soft"
    >
        Replay
    </button>
) : null);

export default AdminWebhooks;
