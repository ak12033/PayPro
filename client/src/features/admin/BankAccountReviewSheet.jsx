import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle } from 'lucide-react';
import Sheet from '../../components/ui/Sheet';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import Field from '../../components/ui/Field';
import { DetailRow } from '../../components/ui/List';
import DocumentViewer from './DocumentViewer';
import ReauthSheet from './ReauthSheet';
import { personName } from './personName';
import { adminApi } from '../../services/api/endpoints/adminApi';
import { getErrorMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/formatters';
import { BANK_DOCUMENT_LABEL, BANK_ACCOUNT_STATUS_META, kycStatusMeta } from '../../constants/kyc';

const TEXTAREA = 'w-full rounded-control border border-border bg-surface px-3 py-2.5 text-sm text-text focus:border-accent';

/**
 * Verify a withdrawal destination (plan.md §0.20.3). The check is a person
 * comparing the holder name with the verified KYC name and the uploaded proof;
 * `nameMatchesKyc` is a hint for that comparison, not the decision.
 */
const BankAccountReviewSheet = ({ accountId, onClose, onChanged }) => {
    const [detail, setDetail] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [number, setNumber] = useState(null);
    const [decision, setDecision] = useState(null);
    const [notes, setNotes] = useState('');
    const [reason, setReason] = useState('');

    const load = useCallback(async () => {
        if (!accountId) return;
        setError(null);
        try {
            setDetail((await adminApi.getBankAccount(accountId)).data);
        } catch (err) {
            setError(getErrorMessage(err, 'Could not load this account.'));
        }
    }, [accountId]);

    useEffect(() => {
        setDetail(null);
        setNumber(null);
        setNotes('');
        setReason('');
        load();
    }, [load]);

    const loadDocument = useCallback((documentId) => adminApi.getBankDocument(accountId, documentId), [accountId]);
    const a = detail?.account;

    const decide = async (currentPassword) => {
        setBusy(true);
        try {
            await adminApi.decideBankAccount(accountId, { decision, notes: notes.trim(), userVisibleReason: reason.trim() || undefined, currentPassword });
            toast.success(decision === 'verified' ? 'Account verified.' : 'Account rejected.');
            setDecision(null);
            onChanged?.();
            onClose();
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not record this.'));
            setDecision(null);
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <Sheet
                open={Boolean(accountId)}
                onClose={onClose}
                title="Bank account check"
                description={a ? `${personName(a.userId)} · added ${formatDateTime(a.createdAt)}` : undefined}
                size="lg"
                dismissible={!busy}
                footer={a?.status === 'pending' && (
                    <div className="space-y-3">
                        <Field label="Notes" hint="What you compared. Kept internally.">
                            {(props) => <textarea {...props} rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} className={TEXTAREA} />}
                        </Field>
                        <Field label="Reason the customer sees (if rejecting)">
                            {(props) => <textarea {...props} rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className={TEXTAREA} />}
                        </Field>
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <Button variant="secondary" disabled={busy || notes.trim().length < 10 || !reason.trim()} onClick={() => setDecision('rejected')}>Reject</Button>
                            <Button variant="primary" disabled={busy || notes.trim().length < 10 || detail?.kyc?.status !== 'VERIFIED'} onClick={() => setDecision('verified')}>Verify account</Button>
                        </div>
                        {detail?.kyc?.status !== 'VERIFIED' && <p className="text-xs text-text-muted">The customer&apos;s identity has to be verified first.</p>}
                    </div>
                )}
            >
                {error ? (
                    <p role="alert" className="py-6 text-center text-sm text-danger">{error}</p>
                ) : !a ? (
                    <div className="grid place-items-center py-10"><Spinner /></div>
                ) : (
                    <div className="space-y-5">
                        <div className="flex flex-wrap gap-2">
                            <Badge tone={BANK_ACCOUNT_STATUS_META[a.status]?.tone ?? 'neutral'} dot>{BANK_ACCOUNT_STATUS_META[a.status]?.label ?? a.status}</Badge>
                            <Badge tone={detail.nameMatchesKyc ? 'positive' : 'warning'}>{detail.nameMatchesKyc ? 'Name matches KYC' : 'Name differs from KYC'}</Badge>
                        </div>
                        {detail.sharedWithOtherAccounts > 0 && (
                            <p className="flex items-start gap-2 rounded-control bg-negative-soft px-3 py-2 text-sm text-negative">
                                <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                                This account is also on {detail.sharedWithOtherAccounts} other customer(s).
                            </p>
                        )}
                        <dl className="divide-y divide-border">
                            <DetailRow label="Holder name" value={a.holderName} />
                            <DetailRow label="KYC legal name" value={detail.kyc ? `${detail.kyc.legalName} (${kycStatusMeta(detail.kyc.status).label})` : 'No submission'} />
                            <DetailRow
                                label="Account number"
                                value={
                                    <span className="inline-flex items-center gap-2">
                                        <span className="font-mono">{number ?? a.accountNumberMasked}</span>
                                        {!number && (
                                            <button
                                                type="button"
                                                className="text-xs font-medium text-accent-text hover:underline"
                                                onClick={async () => {
                                                    try { setNumber((await adminApi.revealBankAccountNumber(a._id)).data.accountNumber); } catch (err) { toast.error(getErrorMessage(err, 'Could not reveal.')); }
                                                }}
                                            >
                                                Reveal (audited)
                                            </button>
                                        )}
                                    </span>
                                }
                            />
                            <DetailRow label="IFSC" value={`${a.ifsc}${a.bankName ? ` · ${a.bankName}` : ''}`} />
                            {a.reviewedAt && <DetailRow label="Reviewed" value={`${formatDateTime(a.reviewedAt)} by ${personName(a.reviewedBy)}`} />}
                        </dl>
                        <section>
                            <h3 className="mb-2 text-sm font-semibold text-text">Proof</h3>
                            <DocumentViewer documents={detail.documents} typeLabels={BANK_DOCUMENT_LABEL} load={loadDocument} />
                        </section>
                    </div>
                )}
            </Sheet>
            <ReauthSheet
                open={Boolean(decision)}
                onClose={() => setDecision(null)}
                loading={busy}
                variant={decision === 'rejected' ? 'danger' : 'primary'}
                title={decision === 'verified' ? 'Verify this bank account?' : 'Reject this bank account?'}
                description={decision === 'verified' ? 'Withdrawals to it become possible, and the customer is told.' : 'The customer is told, with your reason.'}
                confirmLabel={decision === 'verified' ? 'Verify' : 'Reject'}
                onConfirm={decide}
            />
        </>
    );
};

export default BankAccountReviewSheet;
