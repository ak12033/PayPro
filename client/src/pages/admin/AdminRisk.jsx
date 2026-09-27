import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { ShieldCheck } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Amount from '../../components/ui/Amount';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { SkeletonRows } from '../../components/ui/Skeleton';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import ResponsiveTable, { Pager } from '../../features/admin/ResponsiveTable';
import RiskCaseSheet from '../../features/admin/RiskCaseSheet';
import { personName } from '../../features/admin/personName';
import useQuery from '../../hooks/useQuery';
import { adminApi } from '../../services/api/endpoints/adminApi';
import { getErrorMessage } from '../../utils/errors';
import { formatRelativeTime } from '../../utils/formatters';
import { RISK_ACTION_LABEL, RISK_STATUS_LABEL, RISK_STATUS_TONE } from '../../constants/admin';
import { useAuth } from '../../context/AuthContext';

const FILTERS = [
    { value: 'open', label: 'Awaiting review' },
    { value: 'auto_released', label: 'Auto-released' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'all', label: 'All' },
];

/**
 * The held/blocked transfer queue (plan.md §28.2 "Risk", §30.2.3).
 *
 * This is the screen whose absence §0.12 called out: cases were being created
 * on every held transfer with nowhere to work them but the raw API. The server
 * already sorts urgent-then-oldest, so the list order here *is* the work order.
 *
 * "Auto-released" sits second in the filter on purpose. Those are cases the
 * clock decided because nobody got to them, and a lead reviewing the queue
 * should see that number without hunting for it.
 */
const AdminRisk = () => {
    const [status, setStatus] = useState('open');
    const [page, setPage] = useState(1);
    const [activeId, setActiveId] = useState(null);
    const [deciding, setDeciding] = useState(false);
    const { user } = useAuth();

    const queue = useQuery(
        async () => (await adminApi.listRiskCases({ status, page })).data,
        { deps: [status, page] }
    );
    const active = useQuery(
        async () => (await adminApi.getRiskCase(activeId)).data?.case ?? null,
        { deps: [activeId], enabled: Boolean(activeId) }
    );

    const decide = async (decision, notes) => {
        setDeciding(true);
        try {
            await adminApi.decideRiskCase(activeId, { decision, notes });
            toast.success(decision === 'approved'
                ? 'Approved. The customer has been told they can send it again.'
                : 'Rejected. The customer has been told no money moved.');
            setActiveId(null);
            queue.refresh();
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not record that decision.'));
            // A 409 means a colleague decided first — show them the result.
            active.refresh();
        } finally {
            setDeciding(false);
        }
    };

    const escalate = async (reason) => {
        setDeciding(true);
        try {
            await adminApi.escalateRiskCase(activeId, { reason });
            toast.success('Escalated. Admins have been notified.');
            setActiveId(null);
            queue.refresh();
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not escalate this case.'));
            active.refresh();
        } finally {
            setDeciding(false);
        }
    };

    const cases = queue.data?.cases ?? [];

    return (
        <>
            <PageHeader
                title="Risk queue"
                subtitle="Transfers the risk engine held or blocked. No money moved on any of these."
            />

            <SegmentedControl
                label="Case status"
                options={FILTERS}
                value={status}
                onChange={(next) => { setStatus(next); setPage(1); }}
                className="mb-4"
            />

            <Card padding="none">
                {queue.error ? (
                    <ErrorState title="Queue unavailable" message={queue.error} onRetry={queue.retry} reassurance={null} />
                ) : queue.loading ? (
                    <SkeletonRows count={5} />
                ) : cases.length === 0 ? (
                    <EmptyState
                        variant={status === 'open' ? 'first-run' : 'filtered'}
                        icon={<ShieldCheck size={20} />}
                        title={status === 'open' ? 'Nothing waiting' : 'No cases here'}
                        description={status === 'open'
                            ? 'Every held or blocked transfer has been reviewed.'
                            : 'No cases match this filter.'}
                    />
                ) : (
                    <>
                        <ResponsiveTable
                            caption="Risk cases"
                            rows={cases}
                            onRowClick={(row) => setActiveId(row._id)}
                            columns={[
                                {
                                    key: 'customer',
                                    header: 'Customer',
                                    render: (row) => (
                                        <>
                                            <p className="font-medium">{personName(row.userId)}</p>
                                            <p className="text-xs text-text-muted">{row.userId?.email}</p>
                                        </>
                                    ),
                                },
                                {
                                    key: 'amount',
                                    header: 'Amount',
                                    render: (row) => <Amount value={row.intent?.amount} size="sm" />,
                                },
                                {
                                    key: 'action',
                                    header: 'Engine',
                                    render: (row) => (
                                        <span className="flex flex-wrap items-center gap-1.5">
                                            <Badge tone={row.action === 'block' ? 'negative' : 'warning'} size="sm">
                                                {RISK_ACTION_LABEL[row.action]}
                                            </Badge>
                                            {row.priority === 'urgent' && <Badge tone="negative" size="sm">Urgent</Badge>}
                                            {row.escalation?.at && <Badge tone="info" size="sm">Escalated</Badge>}
                                        </span>
                                    ),
                                },
                                {
                                    key: 'score',
                                    header: 'Score',
                                    className: 'tabular-nums',
                                    render: (row) => row.score,
                                },
                                {
                                    key: 'status',
                                    header: 'Status',
                                    render: (row) => (
                                        <Badge tone={RISK_STATUS_TONE[row.status]} size="sm" dot>
                                            {RISK_STATUS_LABEL[row.status]}
                                        </Badge>
                                    ),
                                },
                                {
                                    key: 'age',
                                    header: 'Raised',
                                    className: 'text-text-muted',
                                    render: (row) => formatRelativeTime(row.createdAt),
                                },
                            ]}
                            mobileRow={(row) => ({
                                title: personName(row.userId),
                                subtitle: `${RISK_ACTION_LABEL[row.action]} · score ${row.score} · ${formatRelativeTime(row.createdAt)}`,
                                trailing: (
                                    <>
                                        <Amount value={row.intent?.amount} size="sm" />
                                        <Badge tone={RISK_STATUS_TONE[row.status]} size="sm">
                                            {RISK_STATUS_LABEL[row.status]}
                                        </Badge>
                                    </>
                                ),
                            })}
                        />
                        <Pager page={queue.data.page} totalPages={queue.data.totalPages} total={queue.data.total} onChange={setPage} />
                    </>
                )}
            </Card>

            <RiskCaseSheet
                open={Boolean(activeId)}
                onClose={() => setActiveId(null)}
                riskCase={active.data}
                loading={active.loading}
                error={active.error}
                onDecide={decide}
                onEscalate={escalate}
                deciding={deciding}
                role={user?.role}
            />
        </>
    );
};

export default AdminRisk;
