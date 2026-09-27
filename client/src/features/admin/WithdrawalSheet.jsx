import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Sheet from '../../components/ui/Sheet';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Amount from '../../components/ui/Amount';
import Spinner from '../../components/ui/Spinner';
import Field, { Input } from '../../components/ui/Field';
import { DetailRow } from '../../components/ui/List';
import ReauthSheet from './ReauthSheet';
import { personName } from './personName';
import { adminApi } from '../../services/api/endpoints/adminApi';
import { getErrorMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/formatters';
import { WITHDRAWAL_STATUS_META, kycStatusMeta, BANK_ACCOUNT_STATUS_META } from '../../constants/kyc';
import { AML_RULE_LABEL, AML_SEVERITY_TONE } from '../../constants/admin';

const TEXTAREA = 'w-full rounded-control border border-border bg-surface px-3 py-2.5 text-sm text-text focus:border-accent';

/**
 * One withdrawal and the operator's steps on it (plan.md §0.20.3):
 *
 *   requested  → Approve (re-authenticated) or Reject (money returned)
 *   processing → Mark paid with the bank's UTR (re-authenticated), or Mark
 *                failed if the bank did not complete it (money returned)
 *
 * The full account number is shown only on request, and each reveal is audited:
 * the operator needs it to make the bank transfer, and nobody else does.
 */
const WithdrawalSheet = ({ withdrawalId, onClose, onChanged }) => {
    const [detail, setDetail] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [destination, setDestination] = useState(null);
    const [reference, setReference] = useState('');
    const [reason, setReason] = useState('');
    const [notes, setNotes] = useState('');
    const [confirm, setConfirm] = useState(null); // 'approve' | 'paid' | 'fail'

    const load = useCallback(async () => {
        if (!withdrawalId) return;
        setError(null);
        try {
            setDetail((await adminApi.getWithdrawal(withdrawalId)).data);
        } catch (err) {
            setError(getErrorMessage(err, 'Could not load this withdrawal.'));
        }
    }, [withdrawalId]);

    useEffect(() => {
        setDetail(null);
        setDestination(null);
        setReference('');
        setReason('');
        setNotes('');
        load();
    }, [load]);

    const act = async (work, success) => {
        setBusy(true);
        try {
            await work();
            toast.success(success);
            setConfirm(null);
            onChanged?.();
            await load();
        } catch (err) {
            toast.error(getErrorMessage(err, 'That did not work.'));
            setConfirm(null);
            await load();
        } finally {
            setBusy(false);
        }
    };

    const w = detail?.withdrawal;
    const meta = w ? WITHDRAWAL_STATUS_META[w.status] : null;
    const reasonField = (
        <>
            <Field label="Reason the customer sees" hint="They are told their money is back in their balance.">
                {(props) => <textarea {...props} rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className={TEXTAREA} />}
            </Field>
            <Field label="Internal notes" hint="Optional.">
                {(props) => <textarea {...props} rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} className={TEXTAREA} />}
            </Field>
        </>
    );

    let footer = null;
    if (w && !w.isOwn && w.status === 'requested') {
        footer = (
            <div className="space-y-3">
                {reasonField}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button variant="secondary" disabled={busy || !reason.trim()} onClick={() => act(() => adminApi.rejectWithdrawal(w._id, { userVisibleReason: reason.trim(), notes: notes.trim() }), 'Rejected. The money is back in their balance.')}>
                        Reject
                    </Button>
                    <Button variant="primary" disabled={busy} onClick={() => setConfirm('approve')}>Approve and send</Button>
                </div>
                <p className="text-xs leading-5 text-text-muted">Approving means you are about to send this by bank transfer. Record the UTR once it has gone.</p>
            </div>
        );
    } else if (w && !w.isOwn && w.status === 'processing') {
        footer = (
            <div className="space-y-3">
                <Field label="Bank reference (UTR)" hint="From your bank once the transfer has gone.">
                    {(props) => <Input {...props} value={reference} onChange={(e) => setReference(e.target.value)} autoComplete="off" maxLength={30} className="uppercase" />}
                </Field>
                <details>
                    <summary className="cursor-pointer text-sm font-medium text-text">The bank did not complete it</summary>
                    <div className="mt-3 space-y-3">
                        {reasonField}
                        <div className="flex justify-end">
                            <Button variant="danger" disabled={busy || !reason.trim()} onClick={() => setConfirm('fail')}>Mark failed and return money</Button>
                        </div>
                    </div>
                </details>
                <div className="flex justify-end">
                    <Button variant="primary" disabled={busy || reference.trim().length < 6} onClick={() => setConfirm('paid')}>Mark paid</Button>
                </div>
            </div>
        );
    }

    const confirmCopy = {
        approve: { title: 'Approve this withdrawal?', description: 'You are confirming you will send this amount to the account shown.', label: 'Approve' },
        paid: { title: `Mark paid with UTR ${reference.trim().toUpperCase()}?`, description: 'The customer is told the money has been sent, with this reference.', label: 'Mark paid' },
        fail: { title: 'Mark this withdrawal failed?', description: 'Only if the bank did not complete the transfer. The held money goes back to the customer.', label: 'Mark failed' },
    }[confirm] ?? {};

    const onConfirm = (currentPassword) => {
        if (confirm === 'approve') return act(() => adminApi.approveWithdrawal(w._id, { currentPassword }), 'Approved. Send the transfer, then record its UTR.');
        if (confirm === 'paid') return act(() => adminApi.markWithdrawalPaid(w._id, { reference: reference.trim(), currentPassword }), 'Marked paid.');
        return act(() => adminApi.failWithdrawal(w._id, { userVisibleReason: reason.trim(), notes: notes.trim(), currentPassword }), 'Marked failed. The money is back in their balance.');
    };

    return (
        <>
            <Sheet
                open={Boolean(withdrawalId)}
                onClose={onClose}
                title="Withdrawal"
                description={w ? `${personName(w.userId)} · requested ${formatDateTime(w.createdAt)}` : undefined}
                size="lg"
                dismissible={!busy}
                footer={footer}
            >
                {error ? (
                    <p role="alert" className="py-6 text-center text-sm text-danger">{error}</p>
                ) : !w ? (
                    <div className="grid place-items-center py-10"><Spinner /></div>
                ) : (
                    <div className="space-y-5">
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge tone={meta?.tone} dot>{meta?.label}</Badge>
                            {detail.transaction?.invoiceId && <Badge tone="neutral">{detail.transaction.invoiceId}</Badge>}
                        </div>
                        {w.isOwn && <p className="rounded-control bg-warning-soft px-3 py-2 text-sm text-warning">This is your own withdrawal. Another admin has to process it.</p>}

                        <dl className="divide-y divide-border">
                            <DetailRow label="Amount" value={<Amount minor={w.amountMinor} size="sm" />} />
                            <DetailRow label="Customer" value={`${personName(w.userId)} (${w.userId?.email ?? '—'})`} />
                            <DetailRow label="Identity" value={detail.kyc ? `${kycStatusMeta(detail.kyc.status).label} · ${detail.kyc.legalName}` : 'Not started'} />
                            <DetailRow label="Account holder" value={w.bank.holderName} />
                            <DetailRow
                                label="Account number"
                                value={
                                    <span className="inline-flex items-center gap-2">
                                        <span className="font-mono">{destination ?? w.bank.accountNumberMasked}</span>
                                        {!destination && !w.isOwn && ['requested', 'processing'].includes(w.status) && (
                                            <button
                                                type="button"
                                                className="text-xs font-medium text-accent-text hover:underline"
                                                onClick={async () => {
                                                    try { setDestination((await adminApi.revealWithdrawalDestination(w._id)).data.accountNumber); } catch (err) { toast.error(getErrorMessage(err, 'Could not reveal.')); }
                                                }}
                                            >
                                                Reveal (audited)
                                            </button>
                                        )}
                                    </span>
                                }
                            />
                            <DetailRow label="IFSC" value={`${w.bank.ifsc}${w.bank.bankName ? ` · ${w.bank.bankName}` : ''}`} />
                            <DetailRow label="Destination status" value={BANK_ACCOUNT_STATUS_META[detail.account?.status]?.label ?? detail.account?.status ?? 'Removed'} />
                            {w.payoutReference && <DetailRow label="UTR" value={w.payoutReference} />}
                            {w.userVisibleReason && <DetailRow label="Reason given" value={w.userVisibleReason} />}
                        </dl>

                        <section>
                            <h3 className="mb-2 text-sm font-semibold text-text">AML alerts on this customer</h3>
                            {detail.amlAlerts?.length ? (
                                <ul className="space-y-1.5">
                                    {detail.amlAlerts.map((a) => (
                                        <li key={a._id} className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                                            <Badge tone={AML_SEVERITY_TONE[a.severity]} size="sm">{AML_RULE_LABEL[a.rule] ?? a.rule}</Badge>
                                            {a.status === 'open' ? 'open' : 'closed'} · {a.detail}
                                        </li>
                                    ))}
                                </ul>
                            ) : <p className="text-sm text-text-muted">None.</p>}
                        </section>

                        <section>
                            <h3 className="mb-2 text-sm font-semibold text-text">History</h3>
                            <ol className="space-y-1 text-xs text-text-muted">
                                {w.statusHistory?.map((h) => (
                                    <li key={`${h.to}-${h.at}`}>
                                        {formatDateTime(h.at)} · {WITHDRAWAL_STATUS_META[h.to]?.label ?? h.to}{h.actorId ? ` · ${personName(h.actorId)}` : ''}{h.reason ? ` · ${h.reason}` : ''}
                                    </li>
                                ))}
                            </ol>
                        </section>
                    </div>
                )}
            </Sheet>

            <ReauthSheet
                open={Boolean(confirm)}
                onClose={() => setConfirm(null)}
                loading={busy}
                variant={confirm === 'fail' ? 'danger' : 'primary'}
                title={confirmCopy.title}
                description={confirmCopy.description}
                confirmLabel={confirmCopy.label}
                onConfirm={onConfirm}
            />
        </>
    );
};

export default WithdrawalSheet;
