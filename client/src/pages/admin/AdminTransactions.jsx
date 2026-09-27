import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Sheet from '../../components/ui/Sheet';
import { LedgerAmount } from '../../components/ui/Amount';
import { Input, Select } from '../../components/ui/Field';
import { DetailRow } from '../../components/ui/List';
import { SkeletonRows } from '../../components/ui/Skeleton';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import ResponsiveTable, { Pager } from '../../features/admin/ResponsiveTable';
import { personName } from '../../features/admin/personName';
import { statusMeta } from '../../features/transactions/transactionStatus';
import useQuery from '../../hooks/useQuery';
import { useAuth } from '../../context/AuthContext';
import { adminApi } from '../../services/api/endpoints/adminApi';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { PAYMENT_STATUS_TONE, TX_SOURCE_LABEL, can } from '../../constants/admin';
import { ROUTES } from '../../constants/routes';
import { amountMinorOf } from '../../lib/money';

const STATUSES = ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED'];
const EMPTY_FILTERS = { invoiceId: '', status: '', source: '', type: '', minAmount: '', maxAmount: '', from: '', to: '' };

/** SUCCESS has no badge on customer screens; an operator scanning a list needs every state named. */
const StatusBadge = ({ status }) => {
    const meta = statusMeta(status);
    return meta
        ? <Badge tone={meta.tone} size="sm" dot>{meta.label}</Badge>
        : <Badge tone="positive" size="sm" dot>Settled</Badge>;
};

/**
 * Transaction search across every account (plan.md §28.2 "Transactions").
 *
 * The filters are structured on purpose. An agent on a call has a reference
 * the customer read out (the invoice id) or an account (`?userId=`, reached
 * from a user's sheet); a free-text search over other people's transaction
 * descriptions would be a trawl, not a lookup. Every search is audit-logged.
 *
 * Read-only: nothing on this screen changes a row. Corrections are a manual
 * adjustment from the user's sheet, which writes a *new* row (§29.3 rule 1).
 */
const AdminTransactions = () => {
    const [params, setParams] = useSearchParams();
    const userId = params.get('userId') || undefined;

    const [draft, setDraft] = useState(EMPTY_FILTERS);
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [page, setPage] = useState(1);
    const [openId, setOpenId] = useState(null);

    const results = useQuery(
        async () => (await adminApi.searchTransactions({ ...filters, userId, page })).data,
        { deps: [filters, userId, page] }
    );
    const rows = results.data?.transactions ?? [];

    const set = (key) => (event) => setDraft((current) => ({ ...current, [key]: event.target.value }));
    const apply = (event) => {
        event.preventDefault();
        setFilters({ ...draft, invoiceId: draft.invoiceId.trim() });
        setPage(1);
    };
    const reset = () => {
        setDraft(EMPTY_FILTERS);
        setFilters(EMPTY_FILTERS);
        setPage(1);
    };

    return (
        <>
            <PageHeader title="Transactions" subtitle="Every account's ledger. Searches are recorded in the audit log." />

            {userId && (
                <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                    <Badge tone="info">One account</Badge>
                    <button
                        type="button"
                        onClick={() => { params.delete('userId'); setParams(params); setPage(1); }}
                        className="text-xs font-medium text-accent-text hover:underline"
                    >
                        Show all accounts
                    </button>
                </div>
            )}

            <Card className="mb-4">
                <form onSubmit={apply} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Input
                        value={draft.invoiceId}
                        onChange={set('invoiceId')}
                        placeholder="Reference (invoice id)"
                        aria-label="Reference"
                        prefix={<Search size={15} />}
                        className="sm:col-span-2"
                    />
                    <Select aria-label="Status" value={draft.status} onChange={set('status')}>
                        <option value="">Any status</option>
                        {STATUSES.map((status) => (
                            <option key={status} value={status}>{statusMeta(status)?.label ?? 'Settled'}</option>
                        ))}
                    </Select>
                    <Select aria-label="Source" value={draft.source} onChange={set('source')}>
                        <option value="">Any source</option>
                        {Object.entries(TX_SOURCE_LABEL).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </Select>
                    <Select aria-label="Direction" value={draft.type} onChange={set('type')}>
                        <option value="">In and out</option>
                        <option value="Credit">Money in</option>
                        <option value="Debit">Money out</option>
                    </Select>
                    <div className="grid grid-cols-2 gap-2">
                        <Input inputMode="decimal" value={draft.minAmount} onChange={set('minAmount')} placeholder="Min ₹" aria-label="Minimum amount" />
                        <Input inputMode="decimal" value={draft.maxAmount} onChange={set('maxAmount')} placeholder="Max ₹" aria-label="Maximum amount" />
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-1">
                        <Input type="date" value={draft.from} onChange={set('from')} aria-label="From date" />
                        <Input type="date" value={draft.to} onChange={set('to')} aria-label="To date" />
                    </div>
                    <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
                        <Button type="submit" variant="primary">Search</Button>
                        <Button type="button" variant="ghost" onClick={reset}>Clear</Button>
                    </div>
                </form>
            </Card>

            <Card padding="none">
                {results.error ? (
                    <ErrorState title="Search unavailable" message={results.error} onRetry={results.retry} reassurance={null} />
                ) : results.loading ? (
                    <SkeletonRows count={6} />
                ) : rows.length === 0 ? (
                    <EmptyState
                        variant="filtered"
                        icon={<Search size={20} />}
                        title="No transactions match"
                        description="Try fewer filters, or check the reference with the customer."
                    />
                ) : (
                    <>
                        <ResponsiveTable
                            caption="Transactions"
                            rows={rows}
                            onRowClick={(row) => setOpenId(row._id)}
                            columns={[
                                {
                                    key: 'account',
                                    header: 'Account',
                                    render: (row) => (
                                        <>
                                            <p className="font-medium">{personName(row.userId)}</p>
                                            <p className="text-xs text-text-muted">{row.userId?.email}</p>
                                        </>
                                    ),
                                },
                                {
                                    key: 'description',
                                    header: 'Description',
                                    className: 'max-w-xs',
                                    render: (row) => (
                                        <>
                                            <p className="truncate">{row.description}</p>
                                            <p className="text-xs text-text-muted">
                                                {TX_SOURCE_LABEL[row.source] ?? row.category}
                                                {row.settlement === 'none' && ' · not a balance movement'}
                                            </p>
                                        </>
                                    ),
                                },
                                { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
                                { key: 'amount', header: 'Amount', render: (row) => <LedgerAmount type={row.type} minor={amountMinorOf(row)} size="sm" /> },
                                { key: 'date', header: 'When', className: 'text-text-muted', render: (row) => formatDateTime(row.createdAt) },
                            ]}
                            mobileRow={(row) => ({
                                title: row.description,
                                subtitle: `${personName(row.userId)} · ${formatDateTime(row.createdAt)}`,
                                trailing: <LedgerAmount type={row.type} minor={amountMinorOf(row)} size="sm" />,
                            })}
                        />
                        <Pager
                            page={results.data.currentPage}
                            totalPages={results.data.totalPages}
                            total={results.data.total}
                            onChange={setPage}
                        />
                    </>
                )}
            </Card>

            <TransactionSheet id={openId} onClose={() => setOpenId(null)} />
        </>
    );
};

/** One row, everything linked to it, and its status history. */
const TransactionSheet = ({ id, onClose }) => {
    const { user } = useAuth();
    const detail = useQuery(async () => (await adminApi.getTransaction(id)).data, { deps: [id], enabled: Boolean(id) });
    const tx = detail.data?.transaction;

    return (
        <Sheet open={Boolean(id)} onClose={onClose} title="Transaction" description={tx?.invoiceId} size="md">
            {detail.error ? (
                <ErrorState title="Could not load this transaction" message={detail.error} onRetry={detail.retry} reassurance={null} />
            ) : !tx || detail.loading ? (
                <SkeletonRows count={6} />
            ) : (
                <div className="space-y-5">
                    <dl className="divide-y divide-border">
                        <DetailRow label="Amount" value={<LedgerAmount type={tx.type} minor={amountMinorOf(tx)} size="sm" />} />
                        <DetailRow label="Status" value={<StatusBadge status={tx.status} />} />
                        <DetailRow label="Account" value={`${personName(tx.userId)} (${tx.userId?.email ?? '—'})`} />
                        <DetailRow label="Description" value={tx.description} />
                        <DetailRow label="Category" value={tx.category} />
                        <DetailRow label="Source" value={TX_SOURCE_LABEL[tx.source] ?? '—'} />
                        <DetailRow
                            label="Counts toward balance"
                            value={tx.settlement === 'none' ? 'No — a record only' : 'Yes'}
                        />
                        {tx.riskScore > 0 && <DetailRow label="Risk score" value={`${tx.riskScore} (${tx.riskLevel})`} />}
                        {tx.failureReason && <DetailRow label="Failure reason" value={tx.failureReason} />}
                        <DetailRow label="Created" value={formatDateTime(tx.createdAt)} />
                    </dl>

                    {tx.adjustment?.kind && (
                        <section className="rounded-control bg-surface-sunken p-3 text-sm">
                            <h3 className="font-semibold text-text">
                                {tx.adjustment.kind === 'repair' ? 'Reconciliation repair' : 'Manual adjustment'}
                            </h3>
                            <p className="mt-1 text-text-secondary">“{tx.adjustment.reason}”</p>
                            <p className="mt-1 text-xs text-text-muted">
                                {formatCurrency(tx.adjustment.previousBalance)} → {formatCurrency(tx.adjustment.correctedBalance)}
                                {tx.adjustment.actorId && ` · by ${personName(tx.adjustment.actorId)}`}
                            </p>
                        </section>
                    )}

                    {detail.data.otherLeg && (
                        <section>
                            <h3 className="mb-1 text-sm font-semibold text-text">Other side of this transfer</h3>
                            <p className="text-sm text-text-secondary">
                                {personName(detail.data.otherLeg.userId)} · {detail.data.otherLeg.type} ·{' '}
                                {formatCurrency(detail.data.otherLeg.amount)} · {detail.data.otherLeg.invoiceId}
                            </p>
                        </section>
                    )}

                    {detail.data.payment && (
                        <section>
                            <h3 className="mb-1 text-sm font-semibold text-text">Gateway payment</h3>
                            <p className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
                                <code className="text-xs">{detail.data.payment.orderId}</code>
                                <Badge tone={PAYMENT_STATUS_TONE[detail.data.payment.status]} size="sm">{detail.data.payment.status}</Badge>
                                {!detail.data.payment.walletCredited && <Badge tone="warning" size="sm">Not credited</Badge>}
                            </p>
                            {can(user?.role, 'viewPayments') && (
                                <Link
                                    to={`${ROUTES.ADMIN_PAYMENTS}?orderId=${encodeURIComponent(detail.data.payment.orderId)}`}
                                    className="mt-1 inline-block text-xs font-medium text-accent-text hover:underline"
                                >
                                    Open in Payments
                                </Link>
                            )}
                        </section>
                    )}

                    {tx.statusHistory?.length > 0 && (
                        <section>
                            <h3 className="mb-2 text-sm font-semibold text-text">Status history</h3>
                            <ol className="space-y-2 border-l border-border pl-4 text-sm">
                                {tx.statusHistory.map((step, index) => (
                                    <li key={`${step.at}-${index}`}>
                                        <p className="text-text">{step.from} → {step.to}</p>
                                        <p className="text-xs text-text-muted">
                                            {formatDateTime(step.at)}{step.reason && ` · ${step.reason}`}{step.actor && ` · ${step.actor}`}
                                        </p>
                                    </li>
                                ))}
                            </ol>
                        </section>
                    )}

                    {detail.data.riskCases?.length > 0 && (
                        <p className="text-xs text-text-muted">
                            {detail.data.riskCases.length} risk case{detail.data.riskCases.length === 1 ? '' : 's'} reference this transaction.
                        </p>
                    )}
                </div>
            )}
        </Sheet>
    );
};

export default AdminTransactions;
