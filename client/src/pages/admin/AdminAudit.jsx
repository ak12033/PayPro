import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ScrollText } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { Input, Select } from '../../components/ui/Field';
import { SkeletonRows } from '../../components/ui/Skeleton';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import ResponsiveTable, { Pager } from '../../features/admin/ResponsiveTable';
import { personName } from '../../features/admin/personName';
import useQuery from '../../hooks/useQuery';
import { adminApi } from '../../services/api/endpoints/adminApi';
import { describeDevice, formatDateTime, formatRelativeTime } from '../../utils/formatters';
import { AUDIT_NAMESPACES } from '../../constants/admin';

const OUTCOMES = [
    { value: '', label: 'Any outcome' },
    { value: 'failure', label: 'Failures' },
    { value: 'success', label: 'Successes' },
];

/**
 * Audit trail search (plan.md §28.2 "Audit logs").
 *
 * The filters are the ones investigations actually use: one person's history
 * (reached from a user's sheet, via `?userId=`), a namespace, and failures —
 * which matter more than successes for spotting credential stuffing (see
 * `AuditLog.outcome`). Searching here is itself recorded as a PII access.
 */
const AdminAudit = () => {
    const [params, setParams] = useSearchParams();
    const userId = params.get('userId') || undefined;
    const [action, setAction] = useState('');
    const [outcome, setOutcome] = useState('');
    // IST calendar days, both inclusive (plan.md §28.2 "filter by … date").
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [page, setPage] = useState(1);
    // An inverted range is a typo in progress, not a query: hold the last result instead of a 400.
    const rangeValid = !from || !to || from <= to;

    const logs = useQuery(
        async () => (await adminApi.listAuditLogs({ userId, action, outcome, from, to, page })).data,
        { deps: [userId, action, outcome, from, to, page], enabled: rangeValid }
    );
    const rows = logs.data?.entries ?? [];

    return (
        <>
            <PageHeader title="Audit log" subtitle="Append-only record of security and money events. Kept for 400 days." />

            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Select
                    aria-label="Action type"
                    value={action}
                    onChange={(event) => { setAction(event.target.value); setPage(1); }}
                    className="sm:max-w-60"
                >
                    {AUDIT_NAMESPACES.map((ns) => <option key={ns.value} value={ns.value}>{ns.label}</option>)}
                </Select>
                <SegmentedControl
                    label="Outcome"
                    options={OUTCOMES}
                    value={outcome}
                    onChange={(next) => { setOutcome(next); setPage(1); }}
                />
                <div className="flex items-center gap-2">
                    <Input
                        type="date"
                        aria-label="From date"
                        value={from}
                        max={to || undefined}
                        onChange={(event) => { setFrom(event.target.value); setPage(1); }}
                        className="sm:w-40"
                    />
                    <span className="text-sm text-text-muted" aria-hidden="true">to</span>
                    <Input
                        type="date"
                        aria-label="To date (inclusive)"
                        value={to}
                        min={from || undefined}
                        onChange={(event) => { setTo(event.target.value); setPage(1); }}
                        className="sm:w-40"
                    />
                    {(from || to) && (
                        <button
                            type="button"
                            className="shrink-0 text-sm font-medium text-accent-text hover:underline"
                            onClick={() => { setFrom(''); setTo(''); setPage(1); }}
                        >
                            Clear
                        </button>
                    )}
                </div>
            </div>
            {!rangeValid && (
                <p role="alert" className="-mt-2 mb-4 text-xs text-danger">The start date is after the end date.</p>
            )}

            {userId && (
                <p className="mb-4 flex flex-wrap items-center gap-2 text-sm text-text-muted">
                    Showing one account's history
                    <button type="button" className="font-medium text-accent-text hover:underline" onClick={() => setParams({})}>
                        Show everyone
                    </button>
                </p>
            )}

            <Card padding="none">
                {logs.error ? (
                    <ErrorState title="Audit log unavailable" message={logs.error} onRetry={logs.retry} reassurance={null} />
                ) : logs.loading ? (
                    <SkeletonRows count={8} />
                ) : rows.length === 0 ? (
                    <EmptyState variant="filtered" icon={<ScrollText size={20} />} title="No entries" description="Nothing matches these filters." />
                ) : (
                    <>
                        <ResponsiveTable
                            caption="Audit log entries"
                            rows={rows}
                            columns={[
                                {
                                    key: 'action',
                                    header: 'Action',
                                    render: (row) => (
                                        <span className="flex flex-wrap items-center gap-1.5">
                                            <code className="text-xs">{row.action}</code>
                                            {row.outcome === 'failure' && <Badge tone="negative" size="sm">failure</Badge>}
                                        </span>
                                    ),
                                },
                                {
                                    key: 'who',
                                    header: 'Account',
                                    render: (row) => (row.userId ? personName(row.userId) : <span className="text-text-muted">System</span>),
                                },
                                {
                                    key: 'origin',
                                    header: 'Origin',
                                    className: 'text-xs text-text-muted',
                                    render: (row) => [row.ip, row.userAgent && describeDevice(row.userAgent)].filter(Boolean).join(' · ') || '—',
                                },
                                { key: 'when', header: 'When', className: 'whitespace-nowrap text-text-muted', render: (row) => formatDateTime(row.createdAt) },
                            ]}
                            mobileRow={(row) => ({
                                title: row.action,
                                subtitle: `${row.userId ? personName(row.userId) : 'System'} · ${formatRelativeTime(row.createdAt)}`,
                                trailing: row.outcome === 'failure' ? <Badge tone="negative" size="sm">failure</Badge> : null,
                            })}
                        />
                        <Pager page={logs.data.currentPage} totalPages={logs.data.totalPages} total={logs.data.total} onChange={setPage} />
                    </>
                )}
            </Card>
        </>
    );
};

export default AdminAudit;
