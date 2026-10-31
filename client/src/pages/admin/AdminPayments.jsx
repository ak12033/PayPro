import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CreditCard } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Amount from '../../components/ui/Amount';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { ConfirmSheet } from '../../components/ui/Sheet';
import Field, { Input } from '../../components/ui/Field';
import { SkeletonRows } from '../../components/ui/Skeleton';
import ReauthSheet from '../../features/admin/ReauthSheet';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import ResponsiveTable, { Pager } from '../../features/admin/ResponsiveTable';
import { personName } from '../../features/admin/personName';
import useQuery from '../../hooks/useQuery';
import { useAuth } from '../../context/AuthContext';
import { adminApi } from '../../services/api/endpoints/adminApi';
import { getErrorMessage } from '../../utils/errors';
import { formatDateTime, formatRelativeTime } from '../../utils/formatters';
import { PAYMENT_STATUS_TONE, can } from '../../constants/admin';

const FILTERS = [
    { value: 'stuck', label: 'Needs attention' },
    { value: '', label: 'All' },
    { value: 'created', label: 'Awaiting gateway' },
    { value: 'captured', label: 'Captured' },
    { value: 'failed', label: 'Failed' },
    { value: 'refunded', label: 'Refunded' },
];

/** A captured order that never credited is the one state here where a customer has paid and has nothing. */
const isUncredited = (payment) => payment.status === 'captured' && !payment.walletCredited;

/** Only a credited, not-yet-refunded top-up can go back to its card. */
const isRefundable = (payment) => payment.status === 'captured' && payment.walletCredited && !payment.walletDebitedOnRefund;

/**
 * Gateway payments (plan.md §28.2 "Payments").
 *
 * Opens on "Needs attention" — captured-but-uncredited, or still waiting on the
 * gateway after 30 minutes — because that short list is the reason anyone
 * visits this screen during an incident.
 *
 * Re-settle is admin-only and asks Razorpay what happened rather than trusting
 * the row: it credits only a payment the gateway reports as captured, through
 * the same once-only settlement the webhook uses, so pressing it twice cannot
 * pay twice. It is offered for any uncredited order, not just "captured" ones,
 * because a lost webhook leaves the row saying `created` even after the
 * customer paid.
 *
 * Refund (DEF-01) is admin-only, re-authenticated and needs a written reason.
 * The server takes the money out of the wallet before asking Razorpay, so a
 * top-up the customer has already spent is refused and the card is untouched.
 */
const AdminPayments = () => {
    const { user } = useAuth();
    const [params] = useSearchParams();
    const orderId = params.get('orderId') || undefined;

    const [filter, setFilter] = useState(orderId ? '' : 'stuck');
    const [page, setPage] = useState(1);
    const [target, setTarget] = useState(null);
    const [working, setWorking] = useState(false);

    const payments = useQuery(
        async () => (await adminApi.listPayments({
            status: filter === 'stuck' ? undefined : filter,
            stuck: filter === 'stuck',
            orderId,
            page,
        })).data,
        { deps: [filter, orderId, page] }
    );
    const rows = payments.data?.payments ?? [];
    const canResettle = can(user?.role, 'resettlePayments');
    const canRefund = can(user?.role, 'refundPayments');
    const [refundTarget, setRefundTarget] = useState(null);
    const [refundReason, setRefundReason] = useState('');

    const refund = async (currentPassword) => {
        if (refundReason.trim().length < 10) {
            toast.error('Write a reason of at least 10 characters — it goes to the audit log.');
            return;
        }
        setWorking(true);
        try {
            const { data } = await adminApi.refundPayment(refundTarget.orderId, { reason: refundReason.trim(), currentPassword });
            toast.success(data.message);
            setRefundTarget(null);
            setRefundReason('');
            payments.refresh();
        } catch (err) {
            toast.error(getErrorMessage(err, 'The refund was not issued.'));
        } finally {
            setWorking(false);
        }
    };

    const actionFor = (row) => (isRefundable(row)
        ? (canRefund ? <RowAction label="Refund" onClick={() => setRefundTarget(row)} /> : null)
        : (canResettle && !row.walletCredited ? <RowAction label="Re-settle" onClick={() => setTarget(row)} /> : null));

    const resettle = async () => {
        setWorking(true);
        try {
            const { data } = await adminApi.resettlePayment(target.orderId);
            toast.success(data.message);
            setTarget(null);
            payments.refresh();
        } catch (err) {
            toast.error(getErrorMessage(err, 'Re-settle did not complete.'));
        } finally {
            setWorking(false);
        }
    };

    return (
        <>
            <PageHeader title="Payments" subtitle="Razorpay orders across all accounts. Newest first." />

            <SegmentedControl
                label="Payment filter"
                options={FILTERS}
                value={filter}
                onChange={(next) => { setFilter(next); setPage(1); }}
                className="mb-4"
            />

            <Card padding="none">
                {payments.error ? (
                    <ErrorState title="Payments unavailable" message={payments.error} onRetry={payments.retry} reassurance={null} />
                ) : payments.loading ? (
                    <SkeletonRows count={6} />
                ) : rows.length === 0 ? (
                    <EmptyState
                        variant="filtered"
                        icon={<CreditCard size={20} />}
                        title={filter === 'stuck' ? 'Nothing needs attention' : 'No payments'}
                        description={filter === 'stuck'
                            ? 'Every captured payment has credited its wallet, and nothing is stuck waiting on the gateway.'
                            : 'No payments match this filter.'}
                    />
                ) : (
                    <>
                        <ResponsiveTable
                            caption="Payments"
                            rows={rows}
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
                                { key: 'order', header: 'Order', render: (row) => <code className="text-xs">{row.orderId}</code> },
                                {
                                    key: 'status',
                                    header: 'Status',
                                    render: (row) => (
                                        <span className="flex flex-wrap gap-1.5">
                                            <Badge tone={PAYMENT_STATUS_TONE[row.status]} size="sm" dot>{row.status}</Badge>
                                            {isUncredited(row) && <Badge tone="negative" size="sm">Paid, not credited</Badge>}
                                        </span>
                                    ),
                                },
                                { key: 'amount', header: 'Amount', render: (row) => <Amount value={row.amount} size="sm" /> },
                                { key: 'date', header: 'Created', className: 'text-text-muted', render: (row) => formatDateTime(row.createdAt) },
                                ...(canResettle || canRefund ? [{
                                    key: 'action',
                                    header: <span className="sr-only">Actions</span>,
                                    className: 'text-right',
                                    render: actionFor,
                                }] : []),
                            ]}
                            mobileRow={(row) => ({
                                title: personName(row.userId),
                                subtitle: `${row.orderId} · ${formatRelativeTime(row.createdAt)}`,
                                trailing: actionFor(row)
                                    ?? <Badge tone={isUncredited(row) ? 'negative' : PAYMENT_STATUS_TONE[row.status]} size="sm">{row.status}</Badge>,
                            })}
                        />
                        <Pager page={payments.data.currentPage} totalPages={payments.data.totalPages} total={payments.data.total} onChange={setPage} />
                    </>
                )}
            </Card>

            {canResettle && (
                <p className="mt-3 text-xs leading-5 text-text-muted">
                    “Re-settle” checks an uncredited order with Razorpay. Credited orders have nothing to re-settle.
                    {canRefund && ' “Refund” returns a credited top-up to its card, only while the wallet still holds it.'}
                </p>
            )}

            <ReauthSheet
                open={Boolean(refundTarget)}
                onClose={() => { setRefundTarget(null); setRefundReason(''); }}
                onConfirm={refund}
                loading={working}
                variant="danger"
                title="Refund this top-up to its card?"
                description={refundTarget
                    ? `₹${refundTarget.amount} is taken out of ${personName(refundTarget.userId)}'s wallet and refunded through Razorpay. If the wallet no longer holds it, nothing is refunded.`
                    : ''}
                confirmLabel="Refund"
            >
                <Field label="Reason" hint="At least 10 characters, e.g. the support ticket number. Goes to the audit log.">
                    {(props) => (
                        <Input {...props} maxLength={280} value={refundReason} onChange={(event) => setRefundReason(event.target.value)} />
                    )}
                </Field>
            </ReauthSheet>

            <ConfirmSheet
                open={Boolean(target)}
                onClose={() => setTarget(null)}
                onConfirm={resettle}
                loading={working}
                variant="primary"
                title="Check this order with Razorpay?"
                description={target
                    ? `If Razorpay reports order ${target.orderId} as captured, ${personName(target.userId)}'s wallet is credited ₹${target.amount} — once, even if this is pressed again. If it was not captured, nothing changes.`
                    : ''}
                confirmLabel="Check and settle"
            />
        </>
    );
};

/** Only offered where there is something to do — a row with no action has no button, not a dead one. */
const RowAction = ({ label, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className="rounded-control px-2.5 py-1.5 text-xs font-medium text-accent-text hover:bg-accent-soft"
    >
        {label}
    </button>
);

export default AdminPayments;
