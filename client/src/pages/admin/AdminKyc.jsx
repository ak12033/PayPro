import React, { useState } from 'react';
import { BadgeCheck } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { SkeletonRows } from '../../components/ui/Skeleton';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import ResponsiveTable, { Pager } from '../../features/admin/ResponsiveTable';
import KycReviewSheet from '../../features/admin/KycReviewSheet';
import { personName } from '../../features/admin/personName';
import useQuery from '../../hooks/useQuery';
import { adminApi } from '../../services/api/endpoints/adminApi';
import { formatRelativeTime } from '../../utils/formatters';
import { kycStatusMeta } from '../../constants/kyc';
import { useAuth } from '../../context/AuthContext';

const FILTERS = [
    { value: 'PENDING', label: 'Waiting' },
    { value: 'UNDER_REVIEW', label: 'In review' },
    { value: 'REQUIRES_ACTION', label: 'With customer' },
    { value: 'VERIFIED', label: 'Verified' },
    { value: 'REJECTED', label: 'Rejected' },
    { value: 'all', label: 'All' },
];

/**
 * The identity-check queue (plan.md §0.20.2, §28.2 "KYC review"). Oldest first:
 * the order of the list is the order to work it in.
 */
const AdminKyc = () => {
    const { user } = useAuth();
    const [status, setStatus] = useState('PENDING');
    const [page, setPage] = useState(1);
    const [activeId, setActiveId] = useState(null);

    const queue = useQuery(async () => (await adminApi.listKyc({ status, page })).data, { deps: [status, page] });
    const rows = queue.data?.submissions ?? [];

    return (
        <>
            <PageHeader
                title="Identity checks"
                subtitle="Recording a decision here records the outcome of the approved verification procedure. It is not the check itself."
            />

            <SegmentedControl label="Status" options={FILTERS} value={status} onChange={(next) => { setStatus(next); setPage(1); }} className="mb-4" />

            <Card padding="none">
                {queue.error ? (
                    <ErrorState title="Queue unavailable" message={queue.error} onRetry={queue.retry} reassurance={null} />
                ) : queue.loading ? (
                    <SkeletonRows count={5} />
                ) : rows.length === 0 ? (
                    <EmptyState
                        variant={status === 'PENDING' ? 'first-run' : 'filtered'}
                        icon={<BadgeCheck size={20} />}
                        title={status === 'PENDING' ? 'Nothing waiting' : 'No submissions here'}
                        description={status === 'PENDING' ? 'Every submission has been picked up.' : 'No submissions match this filter.'}
                    />
                ) : (
                    <>
                        <ResponsiveTable
                            caption="KYC submissions"
                            rows={rows}
                            onRowClick={(row) => setActiveId(row._id)}
                            columns={[
                                {
                                    key: 'customer',
                                    header: 'Customer',
                                    render: (row) => (
                                        <>
                                            <p className="font-medium">{row.applicant?.legalName}</p>
                                            <p className="text-xs text-text-muted">{row.userId?.email}</p>
                                        </>
                                    ),
                                },
                                {
                                    key: 'status',
                                    header: 'Status',
                                    render: (row) => (
                                        <span className="flex flex-wrap items-center gap-1.5">
                                            <Badge tone={kycStatusMeta(row.status).tone} size="sm" dot>{kycStatusMeta(row.status).label}</Badge>
                                            {row.screening?.possibleMatches > 0 && <Badge tone="negative" size="sm">Watchlist</Badge>}
                                            {row.documentCount === 0 && <Badge tone="warning" size="sm">No documents</Badge>}
                                        </span>
                                    ),
                                },
                                { key: 'docs', header: 'Docs', className: 'tabular-nums', render: (row) => row.documentCount },
                                { key: 'reviewer', header: 'Reviewer', className: 'text-text-muted', render: (row) => (row.assignedTo ? personName(row.assignedTo) : '—') },
                                { key: 'age', header: 'Submitted', className: 'text-text-muted', render: (row) => formatRelativeTime(row.submittedAt) },
                            ]}
                            mobileRow={(row) => ({
                                title: row.applicant?.legalName,
                                subtitle: `${row.documentCount} document(s) · ${formatRelativeTime(row.submittedAt)}`,
                                trailing: <Badge tone={kycStatusMeta(row.status).tone} size="sm">{kycStatusMeta(row.status).label}</Badge>,
                            })}
                        />
                        <Pager page={queue.data.page} totalPages={queue.data.totalPages} total={queue.data.total} onChange={setPage} />
                    </>
                )}
            </Card>

            <KycReviewSheet
                submissionId={activeId}
                onClose={() => setActiveId(null)}
                onChanged={queue.refresh}
                currentUserId={user?._id}
            />
        </>
    );
};

export default AdminKyc;
