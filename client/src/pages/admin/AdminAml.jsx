import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Radar, Upload } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Amount from '../../components/ui/Amount';
import Spinner from '../../components/ui/Spinner';
import Sheet from '../../components/ui/Sheet';
import SegmentedControl from '../../components/ui/SegmentedControl';
import Field, { Input, Select } from '../../components/ui/Field';
import { DetailRow } from '../../components/ui/List';
import { SkeletonRows } from '../../components/ui/Skeleton';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import ResponsiveTable, { Pager } from '../../features/admin/ResponsiveTable';
import { personName } from '../../features/admin/personName';
import useQuery from '../../hooks/useQuery';
import { adminApi } from '../../services/api/endpoints/adminApi';
import { getErrorMessage } from '../../utils/errors';
import { formatDateTime, formatRelativeTime } from '../../utils/formatters';
import { AML_RULE_LABEL, AML_SEVERITY_TONE, AML_DISPOSITION_LABEL, can } from '../../constants/admin';
import { useAuth } from '../../context/AuthContext';

const TEXTAREA = 'w-full rounded-control border border-border bg-surface px-3 py-2.5 text-sm text-text focus:border-accent';

/**
 * AML monitoring (plan.md §30.3), in shadow mode: every alert here was raised
 * by a rule that flags and never blocks. The header says so, so nobody reads the
 * queue as "these customers were stopped". A "suspicious" disposition drafts an
 * internal report; filing one goes through the regulator's own channel, outside
 * PayPro.
 */
const AdminAml = () => {
    const { user } = useAuth();
    const [tab, setTab] = useState('alerts');

    return (
        <>
            <PageHeader
                title="AML alerts"
                subtitle="Shadow mode: these rules flag activity for review and never block a payment. Thresholds and lists are placeholders until compliance sets them."
            />
            <SegmentedControl
                label="View"
                options={[{ value: 'alerts', label: 'Alerts' }, { value: 'lists', label: 'Watchlists' }]}
                value={tab}
                onChange={setTab}
                className="mb-4"
            />
            {tab === 'alerts' ? <Alerts /> : <Watchlists canImport={can(user?.role, 'importWatchlists')} />}
        </>
    );
};

const Alerts = () => {
    const [status, setStatus] = useState('open');
    const [page, setPage] = useState(1);
    const [activeId, setActiveId] = useState(null);
    const queue = useQuery(async () => (await adminApi.listAmlAlerts({ status, page })).data, { deps: [status, page] });
    const rows = queue.data?.alerts ?? [];

    return (
        <>
            <SegmentedControl
                label="Alert status"
                size="sm"
                options={[{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }, { value: 'all', label: 'All' }]}
                value={status}
                onChange={(next) => { setStatus(next); setPage(1); }}
                className="mb-3"
            />
            <Card padding="none">
                {queue.error ? (
                    <ErrorState title="Alerts unavailable" message={queue.error} onRetry={queue.retry} reassurance={null} />
                ) : queue.loading ? (
                    <SkeletonRows count={5} />
                ) : rows.length === 0 ? (
                    <EmptyState
                        variant={status === 'open' ? 'first-run' : 'filtered'}
                        icon={<Radar size={20} />}
                        title={status === 'open' ? 'No open alerts' : 'No alerts here'}
                        description={status === 'open' ? 'Nothing is waiting for a disposition.' : 'No alerts match this filter.'}
                    />
                ) : (
                    <>
                        <ResponsiveTable
                            caption="AML alerts"
                            rows={rows}
                            onRowClick={(row) => setActiveId(row._id)}
                            columns={[
                                { key: 'customer', header: 'Customer', render: (row) => (<><p className="font-medium">{personName(row.userId)}</p><p className="text-xs text-text-muted">{row.userId?.email}</p></>) },
                                { key: 'rule', header: 'Rule', render: (row) => <Badge tone={AML_SEVERITY_TONE[row.severity]} size="sm">{AML_RULE_LABEL[row.rule] ?? row.rule}</Badge> },
                                { key: 'severity', header: 'Severity', className: 'capitalize text-text-muted', render: (row) => row.severity },
                                { key: 'detail', header: 'What was seen', className: 'max-w-sm text-text-muted', render: (row) => <span className="line-clamp-2">{row.detail}</span> },
                                { key: 'age', header: 'Raised', className: 'text-text-muted', render: (row) => formatRelativeTime(row.createdAt) },
                            ]}
                            mobileRow={(row) => ({
                                title: personName(row.userId),
                                subtitle: `${AML_RULE_LABEL[row.rule] ?? row.rule} · ${formatRelativeTime(row.createdAt)}`,
                                trailing: <Badge tone={AML_SEVERITY_TONE[row.severity]} size="sm">{row.severity}</Badge>,
                            })}
                        />
                        <Pager page={queue.data.page} totalPages={queue.data.totalPages} total={queue.data.total} onChange={setPage} />
                    </>
                )}
            </Card>
            <AlertSheet alertId={activeId} onClose={() => setActiveId(null)} onClosed={queue.refresh} />
        </>
    );
};

const AlertSheet = ({ alertId, onClose, onClosed }) => {
    const detail = useQuery(async () => (await adminApi.getAmlAlert(alertId)).data, { deps: [alertId], enabled: Boolean(alertId) });
    const [disposition, setDisposition] = useState('false_positive');
    const [notes, setNotes] = useState('');
    const [reportDraft, setReportDraft] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        setDisposition('false_positive');
        setNotes('');
        setReportDraft('');
    }, [alertId]);

    const alert = detail.data?.alert;
    const ready = notes.trim().length >= 10 && (disposition !== 'suspicious' || reportDraft.trim().length >= 20);

    const close = async () => {
        setBusy(true);
        try {
            await adminApi.closeAmlAlert(alertId, { disposition, notes: notes.trim(), reportDraft: reportDraft.trim() });
            toast.success('Alert closed.');
            onClosed?.();
            onClose();
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not close this alert.'));
            detail.refresh();
        } finally {
            setBusy(false);
        }
    };

    return (
        <Sheet
            open={Boolean(alertId)}
            onClose={onClose}
            title="AML alert"
            description={alert ? `${personName(alert.userId)} · raised ${formatDateTime(alert.createdAt)}` : undefined}
            size="lg"
            dismissible={!busy}
            footer={alert?.status === 'open' && (
                <div className="space-y-3">
                    <Field label="Disposition">
                        {(props) => (
                            <Select {...props} value={disposition} onChange={(e) => setDisposition(e.target.value)}>
                                {Object.entries(AML_DISPOSITION_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </Select>
                        )}
                    </Field>
                    <Field label="Notes" hint="What you looked at and why you concluded this.">
                        {(props) => <textarea {...props} rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} className={TEXTAREA} />}
                    </Field>
                    {disposition === 'suspicious' && (
                        <Field label="Internal report draft" hint="Kept internally. Filing, if required, happens through the regulator's own channel.">
                            {(props) => <textarea {...props} rows={4} maxLength={5000} value={reportDraft} onChange={(e) => setReportDraft(e.target.value)} className={TEXTAREA} />}
                        </Field>
                    )}
                    <div className="flex justify-end">
                        <Button variant="primary" onClick={close} loading={busy} disabled={!ready}>Close alert</Button>
                    </div>
                </div>
            )}
        >
            {detail.error ? (
                <p role="alert" className="py-6 text-center text-sm text-danger">{detail.error}</p>
            ) : !alert ? (
                <div className="grid place-items-center py-10"><Spinner /></div>
            ) : (
                <div className="space-y-5">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={AML_SEVERITY_TONE[alert.severity]}>{AML_RULE_LABEL[alert.rule] ?? alert.rule}</Badge>
                        <Badge tone="neutral">Shadow mode</Badge>
                        {alert.status === 'closed' && <Badge tone="neutral" dot>{AML_DISPOSITION_LABEL[alert.disposition]}</Badge>}
                    </div>
                    <p className="text-sm leading-6 text-text">{alert.detail}</p>
                    <dl className="divide-y divide-border">
                        <DetailRow label="Customer" value={`${personName(alert.userId)} (${alert.userId?.email ?? '—'})`} />
                        <DetailRow label="Account status" value={`${alert.userId?.status ?? '—'} · ${alert.userId?.kycTier ?? 'unverified'} tier`} />
                        {alert.evidence?.totalMinor != null && <DetailRow label="Total" value={<Amount minor={alert.evidence.totalMinor} size="sm" />} />}
                        {alert.evidence?.counterpartyCount != null && <DetailRow label="Counterparties" value={alert.evidence.counterpartyCount} />}
                        {alert.evidence?.matchedName && <DetailRow label="Matched entry" value={`${alert.evidence.matchedName} (${alert.evidence.watchlistName})`} />}
                        {alert.reviewedAt && <DetailRow label="Closed" value={`${formatDateTime(alert.reviewedAt)} by ${personName(alert.reviewedBy)}`} />}
                    </dl>
                    {alert.evidence?.transactionIds?.length > 0 && (
                        <section>
                            <h3 className="mb-2 text-sm font-semibold text-text">Transactions</h3>
                            <ul className="divide-y divide-border rounded-control border border-border">
                                {alert.evidence.transactionIds.map((t) => (
                                    <li key={t._id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                        <span className="min-w-0 truncate text-text">{t.description}<span className="block text-xs text-text-muted">{formatDateTime(t.createdAt)} · {t.status}</span></span>
                                        <Amount minor={t.amountMinor} value={t.amount} size="sm" />
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                    {alert.notes && <section><h3 className="mb-1 text-sm font-semibold text-text">Notes</h3><p className="whitespace-pre-wrap text-sm text-text-muted">{alert.notes}</p></section>}
                    {detail.data.otherAlerts?.length > 0 && (
                        <section>
                            <h3 className="mb-2 text-sm font-semibold text-text">Other alerts on this customer</h3>
                            <ul className="space-y-1 text-sm text-text-muted">
                                {detail.data.otherAlerts.map((o) => (
                                    <li key={o._id}>{AML_RULE_LABEL[o.rule] ?? o.rule} · {o.severity} · {o.status === 'open' ? 'open' : AML_DISPOSITION_LABEL[o.disposition]} · {formatRelativeTime(o.createdAt)}</li>
                                ))}
                            </ul>
                        </section>
                    )}
                </div>
            )}
        </Sheet>
    );
};

const Watchlists = ({ canImport }) => {
    const lists = useQuery(async () => (await adminApi.listWatchlists()).data?.watchlists ?? []);
    const [name, setName] = useState('');
    const [source, setSource] = useState('');
    const [file, setFile] = useState(null);
    const [busy, setBusy] = useState(false);

    const importList = async () => {
        setBusy(true);
        try {
            const csv = await file.text();
            const { data } = await adminApi.importWatchlist({ name: name.trim(), source: source.trim(), csv });
            toast.success(`Imported version ${data.watchlist.version}: ${data.entries} entries${data.skipped ? `, ${data.skipped} skipped` : ''}. ${data.rescreen.matched} possible match(es) found.`);
            setFile(null);
            lists.refresh();
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not import this list.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-4">
            {canImport && (
                <Card>
                    <h2 className="text-sm font-semibold text-text">Import a list</h2>
                    <p className="mt-1 text-xs leading-5 text-text-muted">
                        CSV with a <code>name</code> column; <code>date_of_birth</code> (YYYY-MM-DD) and <code>reference</code> are optional.
                        Importing under an existing name creates a new version and retires the old one. Every identity submission is screened again.
                    </p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <Field label="List name">{(props) => <Input {...props} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />}</Field>
                        <Field label="Published by / source">{(props) => <Input {...props} value={source} onChange={(e) => setSource(e.target.value)} maxLength={300} />}</Field>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                        <input type="file" accept=".csv,text/csv" aria-label="CSV file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm text-text-muted" />
                        <Button variant="primary" icon={<Upload size={14} />} onClick={importList} loading={busy} disabled={!file || !name.trim() || !source.trim()}>Import</Button>
                    </div>
                </Card>
            )}
            <Card padding="none">
                {lists.error ? (
                    <ErrorState title="Lists unavailable" message={lists.error} onRetry={lists.retry} reassurance={null} />
                ) : lists.loading ? (
                    <SkeletonRows count={3} />
                ) : !lists.data.length ? (
                    <EmptyState icon={<Radar size={20} />} title="No watchlists" description="No screening happens until a list is imported. Which lists apply is for compliance to decide." />
                ) : (
                    <ResponsiveTable
                        caption="Watchlists"
                        rows={lists.data}
                        columns={[
                            { key: 'name', header: 'List', render: (row) => (<><p className="font-medium">{row.name}</p><p className="text-xs text-text-muted">{row.source}</p></>) },
                            { key: 'version', header: 'Version', className: 'tabular-nums', render: (row) => `v${row.version}` },
                            { key: 'state', header: 'State', render: (row) => <Badge tone={row.active ? 'positive' : 'neutral'} size="sm" dot>{row.active ? 'Active' : 'Retired'}</Badge> },
                            { key: 'entries', header: 'Entries', className: 'tabular-nums', render: (row) => row.entryCount.toLocaleString('en-IN') },
                            { key: 'imported', header: 'Imported', className: 'text-text-muted', render: (row) => `${formatRelativeTime(row.createdAt)} by ${personName(row.importedBy)}` },
                        ]}
                        mobileRow={(row) => ({
                            title: `${row.name} v${row.version}`,
                            subtitle: `${row.entryCount} entries · ${formatRelativeTime(row.createdAt)}`,
                            trailing: <Badge tone={row.active ? 'positive' : 'neutral'} size="sm">{row.active ? 'Active' : 'Retired'}</Badge>,
                        })}
                    />
                )}
            </Card>
        </div>
    );
};

export default AdminAml;
