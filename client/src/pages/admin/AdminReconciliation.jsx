import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import PageHeader, { SectionHeading } from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Amount from '../../components/ui/Amount';
import { ConfirmSheet } from '../../components/ui/Sheet';
import Field, { Input } from '../../components/ui/Field';
import { SkeletonRows } from '../../components/ui/Skeleton';
import ErrorState from '../../components/feedback/ErrorState';
import ResponsiveTable from '../../features/admin/ResponsiveTable';
import useQuery from '../../hooks/useQuery';
import { useAuth } from '../../context/AuthContext';
import { adminApi } from '../../services/api/endpoints/adminApi';
import { getErrorMessage } from '../../utils/errors';
import { formatDateTime, formatNumber } from '../../utils/formatters';
import { can } from '../../constants/admin';
import cn from '../../lib/cn';

/**
 * Wallet reconciliation (plan.md §28.2 "Wallets / Reconciliation", §29.3).
 *
 * The report is read-only and safe to run at any time. Repair is admin-only,
 * one account at a time, and asks for a reason that goes into the audit entry —
 * it moves a stored balance to match its ledger, which is the most consequential
 * button in the console, so it is never one click.
 *
 * The integer-paise verification sits below the rupee report because it answers
 * a different question: not "is money missing" but "are the new integer columns
 * ready to be trusted" (plan.md §7.4). Running the backfill stays a CLI step.
 */
const AdminReconciliation = () => {
    const { user } = useAuth();
    const [params, setParams] = useSearchParams();
    const userId = params.get('userId') || undefined;

    const [target, setTarget] = useState(null);
    const [reason, setReason] = useState('');
    const [repairing, setRepairing] = useState(false);

    const report = useQuery(async () => (await adminApi.getReconciliation({ userId })).data, { deps: [userId] });
    const minor = useQuery(async () => (await adminApi.getMinorVerification()).data);

    const repair = async () => {
        if (!reason.trim()) {
            toast.error('Give a reason — it is recorded with the adjustment.');
            return;
        }
        setRepairing(true);
        try {
            const { data } = await adminApi.repair(target._id, { reason: reason.trim() });
            toast.success(data.repaired
                ? `Balance corrected from ₹${data.previousBalance} to ₹${data.correctedBalance}.`
                : data.message);
            setTarget(null);
            setReason('');
            report.retry();
            minor.refresh();
        } catch (err) {
            toast.error(getErrorMessage(err, 'Repair failed. Nothing was changed.'));
        } finally {
            setRepairing(false);
        }
    };

    const r = report.data;

    return (
        <>
            <PageHeader
                title="Reconciliation"
                subtitle={userId ? 'One account against its ledger.' : 'Every stored balance against the ledger rows that should produce it.'}
                action={
                    <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={report.retry} loading={report.loading}>
                        Run again
                    </Button>
                }
            />

            {userId && (
                <p className="mb-4 flex flex-wrap items-center gap-2 text-sm text-text-muted">
                    Filtered to account <code className="text-xs">{userId}</code>
                    <button type="button" className="font-medium text-accent-text hover:underline" onClick={() => setParams({})}>
                        Show all accounts
                    </button>
                </p>
            )}

            {report.error ? (
                <Card><ErrorState title="Report failed" message={report.error} onRetry={report.retry} reassurance="Running the report never changes a balance." /></Card>
            ) : report.loading || !r ? (
                <Card padding="none"><SkeletonRows count={4} /></Card>
            ) : (
                <div className="space-y-6">
                    <HealthBanner
                        healthy={r.healthy}
                        title={r.healthy ? 'Ledger and balances agree' : 'Discrepancies found'}
                        detail={`Generated ${formatDateTime(r.generatedAt)} in ${formatNumber(r.durationMs)}ms.`}
                    />

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <Stat label="Drifted accounts" value={formatNumber(r.summary.driftedAccounts)} bad={r.summary.driftedAccounts > 0} />
                        <Stat label="Net drift" value={<Amount value={r.summary.netDrift} minor={r.summary.netDriftMinor} size="sm" />} bad={r.summary.netDrift !== 0} />
                        <Stat label="Orphaned transfer legs" value={formatNumber(r.summary.orphanedTransferLegs)} bad={r.summary.orphanedTransferLegs > 0} />
                        <Stat
                            label="Payment mismatches"
                            value={formatNumber(r.summary.capturedPaymentsMissingCredit + r.summary.creditsWithoutCapturedPayment)}
                            bad={r.summary.capturedPaymentsMissingCredit + r.summary.creditsWithoutCapturedPayment > 0}
                        />
                    </div>

                    {r.balanceDrift.length > 0 && (
                        <section>
                            <SectionHeading title="Accounts that disagree with their ledger" />
                            <p className="mb-2 text-xs leading-5 text-text-muted">
                                Positive drift: the stored balance is higher than the ledger justifies. Negative: lower.
                            </p>
                            <Card padding="none">
                                <ResponsiveTable
                                    caption="Drifted accounts"
                                    rows={r.balanceDrift}
                                    onRowClick={can(user?.role, 'repairBalances') ? setTarget : undefined}
                                    columns={[
                                        { key: 'email', header: 'Account', render: (row) => row.email ?? String(row._id) },
                                        { key: 'stored', header: 'Stored', render: (row) => <Amount minor={row.balanceMinor} size="sm" /> },
                                        { key: 'ledger', header: 'Ledger', render: (row) => <Amount minor={row.expectedMinor} size="sm" /> },
                                        { key: 'drift', header: 'Drift', render: (row) => <Amount minor={row.driftMinor} size="sm" tone="negative" /> },
                                        { key: 'entries', header: 'Rows', className: 'tabular-nums text-text-muted', render: (row) => row.entryCount },
                                    ]}
                                    mobileRow={(row) => ({
                                        title: row.email ?? String(row._id),
                                        subtitle: `${row.entryCount} ledger rows`,
                                        trailing: <Amount minor={row.driftMinor} size="sm" tone="negative" />,
                                    })}
                                />
                            </Card>
                        </section>
                    )}

                    {(r.orphanedLegs.length > 0 || r.payments.missingCredits.length > 0 || r.payments.unbackedCredits.length > 0) && (
                        <Card>
                            <h2 className="text-sm font-semibold text-text">Needs investigation, not repair</h2>
                            <p className="mt-1 text-xs leading-5 text-text-muted">
                                Orphaned transfer legs and payment mismatches cannot be fixed by moving a balance. Use
                                <code className="mx-1">npm run reconcile -- --json</code>for the full row-level detail.
                            </p>
                        </Card>
                    )}
                </div>
            )}

            <section className="mt-8" aria-labelledby="minor-heading">
                <SectionHeading id="minor-heading" title="Integer-paise migration readiness" />
                {minor.error ? (
                    <Card><ErrorState title="Check failed" message={minor.error} onRetry={minor.retry} reassurance={null} /></Card>
                ) : minor.loading || !minor.data ? (
                    <Card padding="none"><SkeletonRows count={2} /></Card>
                ) : (
                    <Card>
                        <HealthBanner
                            bare
                            healthy={minor.data.healthy}
                            title={minor.data.healthy ? 'Ready: paise columns match the ledger' : 'Not ready to switch reads to paise'}
                            detail={minor.data.healthy
                                ? 'Every row and balance carries a correct integer-paise value.'
                                : 'Run the backfill from the server: npm run backfill:minor -- --apply, then check again.'}
                        />
                        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                            <MinorRow label="Rows missing status/settlement" value={minor.data.summary.transactionsMissingLifecycle} />
                            <MinorRow label="Rows missing or wrong amountMinor" value={minor.data.summary.transactionsMissingOrMismatched} />
                            <MinorRow label="Users missing or wrong balanceMinor" value={minor.data.summary.usersMissingOrMismatched} />
                            <MinorRow label="Accounts with integer ledger drift" value={minor.data.summary.accountsWithMinorLedgerDrift} />
                        </dl>
                    </Card>
                )}
            </section>

            <ConfirmSheet
                open={Boolean(target)}
                onClose={() => { setTarget(null); setReason(''); }}
                onConfirm={repair}
                loading={repairing}
                variant="danger"
                title="Correct this balance?"
                description={target ? `${target.email}: stored balance moves to match the ledger.` : ''}
                confirmLabel="Correct balance"
            >
                {target && (
                    <div className="space-y-4">
                        <dl className="rounded-control bg-surface-sunken px-3 py-2 text-sm">
                            <div className="flex justify-between py-1"><dt className="text-text-muted">Stored</dt><dd><Amount minor={target.balanceMinor} size="sm" /></dd></div>
                            <div className="flex justify-between py-1"><dt className="text-text-muted">Ledger says</dt><dd><Amount minor={target.expectedMinor} size="sm" /></dd></div>
                        </dl>
                        <p className="text-xs leading-5 text-text-muted">
                            The ledger is treated as the source of truth. The balance is re-checked inside a database
                            transaction first, so if it has changed since this report ran, nothing is written.
                        </p>
                        <Field label="Reason" required hint="Shown to the customer on the correction row in their activity. Your name goes to the audit log only.">
                            {(props) => (
                                <Input {...props} value={reason} maxLength={280} onChange={(event) => setReason(event.target.value)} />
                            )}
                        </Field>
                    </div>
                )}
            </ConfirmSheet>
        </>
    );
};

const HealthBanner = ({ healthy, title, detail, bare = false }) => {
    const Icon = healthy ? CheckCircle2 : AlertTriangle;
    return (
        <div
            role="status"
            className={cn(
                'flex items-start gap-3',
                !bare && 'rounded-card px-4 py-3',
                !bare && (healthy ? 'bg-positive-soft' : 'bg-warning-soft')
            )}
        >
            <Icon size={18} aria-hidden="true" className={cn('mt-0.5 shrink-0', healthy ? 'text-positive' : 'text-warning')} />
            <div>
                <p className="text-sm font-semibold text-text">{title}</p>
                <p className="mt-0.5 text-xs leading-5 text-text-muted">{detail}</p>
            </div>
        </div>
    );
};

const Stat = ({ label, value, bad }) => (
    <Card padding="md">
        <p className="text-xs text-text-muted">{label}</p>
        <div className={cn('mt-1 text-lg font-semibold tabular-nums', bad ? 'text-warning' : 'text-text')}>{value}</div>
    </Card>
);

const MinorRow = ({ label, value }) => (
    <div className="flex items-center justify-between gap-3 rounded-control bg-surface-sunken px-3 py-2">
        <dt className="text-text-muted">{label}</dt>
        <dd className={cn('font-semibold tabular-nums', value > 0 ? 'text-warning' : 'text-text')}>{formatNumber(value ?? 0)}</dd>
    </div>
);

export default AdminReconciliation;
