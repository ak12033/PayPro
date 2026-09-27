import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Landmark, Upload } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Amount from '../../components/ui/Amount';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { SkeletonRows } from '../../components/ui/Skeleton';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import ResponsiveTable, { Pager } from '../../features/admin/ResponsiveTable';
import WithdrawalSheet from '../../features/admin/WithdrawalSheet';
import BankAccountReviewSheet from '../../features/admin/BankAccountReviewSheet';
import { personName } from '../../features/admin/personName';
import useQuery from '../../hooks/useQuery';
import { adminApi } from '../../services/api/endpoints/adminApi';
import { getErrorMessage } from '../../utils/errors';
import { formatRelativeTime, formatDateTime } from '../../utils/formatters';
import { WITHDRAWAL_STATUS_META, BANK_ACCOUNT_STATUS_META } from '../../constants/kyc';

/**
 * Withdrawals (plan.md §0.20.3): the payout queue, the bank-account checks it
 * depends on, and matching a bank statement against what was marked paid.
 * Money leaves by an operator's bank transfer; this console records it.
 */
const AdminWithdrawals = () => {
    const [tab, setTab] = useState('withdrawals');
    return (
        <>
            <PageHeader
                title="Withdrawals"
                subtitle="Each withdrawal is sent by bank transfer from the account holding customer funds, then recorded here with its UTR."
            />
            <SegmentedControl
                label="View"
                options={[
                    { value: 'withdrawals', label: 'Payouts' },
                    { value: 'accounts', label: 'Bank accounts' },
                    { value: 'statement', label: 'Statement match' },
                ]}
                value={tab}
                onChange={setTab}
                className="mb-4"
            />
            {tab === 'withdrawals' && <Payouts />}
            {tab === 'accounts' && <Accounts />}
            {tab === 'statement' && <Statement />}
        </>
    );
};

const PAYOUT_FILTERS = [
    { value: 'requested', label: 'To approve' },
    { value: 'processing', label: 'Sending' },
    { value: 'stuck', label: 'Stuck' },
    { value: 'paid', label: 'Paid' },
    { value: 'all', label: 'All' },
];

const Payouts = () => {
    const [status, setStatus] = useState('requested');
    const [page, setPage] = useState(1);
    const [activeId, setActiveId] = useState(null);
    const queue = useQuery(async () => (await adminApi.listWithdrawals({ status, page })).data, { deps: [status, page] });
    const rows = queue.data?.withdrawals ?? [];
    const open = queue.data?.open ?? {};

    return (
        <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <SegmentedControl label="Withdrawal status" size="sm" options={PAYOUT_FILTERS} value={status} onChange={(next) => { setStatus(next); setPage(1); }} />
                <p className="text-xs text-text-muted">
                    Held now: {open.requested?.count ?? 0} to approve, {open.processing?.count ?? 0} sending ·{' '}
                    <Amount minor={(open.requested?.totalMinor ?? 0) + (open.processing?.totalMinor ?? 0)} size="sm" />
                </p>
            </div>
            <Card padding="none">
                {queue.error ? (
                    <ErrorState title="Queue unavailable" message={queue.error} onRetry={queue.retry} reassurance={null} />
                ) : queue.loading ? (
                    <SkeletonRows count={5} />
                ) : rows.length === 0 ? (
                    <EmptyState
                        variant={status === 'requested' ? 'first-run' : 'filtered'}
                        icon={<Landmark size={20} />}
                        title={status === 'requested' ? 'Nothing to approve' : status === 'stuck' ? 'Nothing stuck' : 'No withdrawals here'}
                        description={status === 'stuck' ? 'No approved withdrawal has waited more than 48 hours for its UTR.' : 'No withdrawals match this filter.'}
                    />
                ) : (
                    <>
                        <ResponsiveTable
                            caption="Withdrawals"
                            rows={rows}
                            onRowClick={(row) => setActiveId(row._id)}
                            columns={[
                                { key: 'customer', header: 'Customer', render: (row) => (<><p className="font-medium">{personName(row.userId)}</p><p className="text-xs text-text-muted">{row.userId?.email}</p></>) },
                                { key: 'amount', header: 'Amount', render: (row) => <Amount minor={row.amountMinor} size="sm" /> },
                                { key: 'to', header: 'To', className: 'text-text-muted', render: (row) => `${row.bank?.ifsc} · ${row.bank?.accountNumberMasked}` },
                                { key: 'status', header: 'Status', render: (row) => <Badge tone={WITHDRAWAL_STATUS_META[row.status]?.tone} size="sm" dot>{WITHDRAWAL_STATUS_META[row.status]?.label}</Badge> },
                                { key: 'age', header: 'Requested', className: 'text-text-muted', render: (row) => formatRelativeTime(row.createdAt) },
                            ]}
                            mobileRow={(row) => ({
                                title: personName(row.userId),
                                subtitle: `${row.bank?.accountNumberMasked} · ${formatRelativeTime(row.createdAt)}`,
                                trailing: (<><Amount minor={row.amountMinor} size="sm" /><Badge tone={WITHDRAWAL_STATUS_META[row.status]?.tone} size="sm">{WITHDRAWAL_STATUS_META[row.status]?.label}</Badge></>),
                            })}
                        />
                        <Pager page={queue.data.page} totalPages={queue.data.totalPages} total={queue.data.total} onChange={setPage} />
                    </>
                )}
            </Card>
            <WithdrawalSheet withdrawalId={activeId} onClose={() => setActiveId(null)} onChanged={queue.refresh} />
        </>
    );
};

const Accounts = () => {
    const [status, setStatus] = useState('pending');
    const [page, setPage] = useState(1);
    const [activeId, setActiveId] = useState(null);
    const queue = useQuery(async () => (await adminApi.listBankAccounts({ status, page })).data, { deps: [status, page] });
    const rows = queue.data?.accounts ?? [];

    return (
        <>
            <SegmentedControl
                label="Account status"
                size="sm"
                options={[{ value: 'pending', label: 'To check' }, { value: 'verified', label: 'Verified' }, { value: 'rejected', label: 'Rejected' }, { value: 'all', label: 'All' }]}
                value={status}
                onChange={(next) => { setStatus(next); setPage(1); }}
                className="mb-3"
            />
            <Card padding="none">
                {queue.error ? (
                    <ErrorState title="Accounts unavailable" message={queue.error} onRetry={queue.retry} reassurance={null} />
                ) : queue.loading ? (
                    <SkeletonRows count={5} />
                ) : rows.length === 0 ? (
                    <EmptyState variant="filtered" icon={<Landmark size={20} />} title="No accounts here" description="No bank accounts match this filter." />
                ) : (
                    <>
                        <ResponsiveTable
                            caption="Bank accounts"
                            rows={rows}
                            onRowClick={(row) => setActiveId(row._id)}
                            columns={[
                                { key: 'customer', header: 'Customer', render: (row) => (<><p className="font-medium">{personName(row.userId)}</p><p className="text-xs text-text-muted">{row.userId?.email}</p></>) },
                                { key: 'holder', header: 'Holder', render: (row) => row.holderName },
                                { key: 'number', header: 'Account', className: 'text-text-muted', render: (row) => `${row.ifsc} · ${row.accountNumberMasked}` },
                                { key: 'status', header: 'Status', render: (row) => <Badge tone={BANK_ACCOUNT_STATUS_META[row.status]?.tone ?? 'neutral'} size="sm" dot>{BANK_ACCOUNT_STATUS_META[row.status]?.label ?? row.status}</Badge> },
                                { key: 'age', header: 'Added', className: 'text-text-muted', render: (row) => formatRelativeTime(row.createdAt) },
                            ]}
                            mobileRow={(row) => ({
                                title: row.holderName,
                                subtitle: `${row.accountNumberMasked} · ${formatRelativeTime(row.createdAt)}`,
                                trailing: <Badge tone={BANK_ACCOUNT_STATUS_META[row.status]?.tone ?? 'neutral'} size="sm">{BANK_ACCOUNT_STATUS_META[row.status]?.label ?? row.status}</Badge>,
                            })}
                        />
                        <Pager page={queue.data.page} totalPages={queue.data.totalPages} total={queue.data.total} onChange={setPage} />
                    </>
                )}
            </Card>
            <BankAccountReviewSheet accountId={activeId} onClose={() => setActiveId(null)} onChanged={queue.refresh} />
        </>
    );
};

const Statement = () => {
    const [file, setFile] = useState(null);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);

    const match = async () => {
        setBusy(true);
        try {
            setResult((await adminApi.matchStatement(await file.text())).data);
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not read this statement.'));
        } finally {
            setBusy(false);
        }
    };

    const Section = ({ title, tone, rows, render }) => (
        <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-text">
                {title} <Badge tone={rows.length ? tone : 'neutral'} size="sm">{rows.length}</Badge>
            </h3>
            {rows.length > 0 && <ul className="divide-y divide-border rounded-control border border-border text-sm">{rows.map(render)}</ul>}
        </section>
    );

    return (
        <div className="space-y-4">
            <Card>
                <p className="text-sm leading-6 text-text-muted">
                    Export the debits from the bank account you pay withdrawals from as CSV, with a <code>reference</code> or <code>utr</code> column and an <code>amount</code> column in rupees.
                    Exact matches are marked reconciled; everything else is listed for you to look at. Nothing else changes.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                    <input type="file" accept=".csv,text/csv" aria-label="Bank statement CSV" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm text-text-muted" />
                    <Button variant="primary" icon={<Upload size={14} />} onClick={match} loading={busy} disabled={!file}>Match statement</Button>
                </div>
            </Card>
            {result && (
                <Card className="space-y-5">
                    <p className="text-sm text-text-muted">{result.lines} statement line(s) with a reference.</p>
                    <Section title="Matched" tone="positive" rows={result.matched} render={(r) => <li key={r.reference} className="flex justify-between px-3 py-2"><span>{r.reference}</span><Amount minor={r.amountMinor} size="sm" /></li>} />
                    <Section title="Amount differs" tone="negative" rows={result.amountMismatch} render={(r) => <li key={r.reference} className="flex justify-between px-3 py-2"><span>{r.reference}</span><span>statement <Amount minor={r.amountMinor} size="sm" /> · PayPro <Amount minor={r.expectedMinor} size="sm" /></span></li>} />
                    <Section title="Not a PayPro withdrawal" tone="warning" rows={result.unknown} render={(r) => <li key={r.reference} className="flex justify-between px-3 py-2"><span>{r.reference}</span><Amount minor={r.amountMinor} size="sm" /></li>} />
                    <Section title="Paid in PayPro, not on any statement yet" tone="warning" rows={result.unmatchedPaid} render={(w) => <li key={w._id} className="flex justify-between px-3 py-2"><span>{w.payoutReference} · {personName(w.userId)} · {formatDateTime(w.paidAt)}</span><Amount minor={w.amountMinor} size="sm" /></li>} />
                </Card>
            )}
        </div>
    );
};

export default AdminWithdrawals;
