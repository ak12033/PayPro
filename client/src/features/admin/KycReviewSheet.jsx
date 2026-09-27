import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle } from 'lucide-react';
import Sheet from '../../components/ui/Sheet';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import SegmentedControl from '../../components/ui/SegmentedControl';
import Field, { Input, Select } from '../../components/ui/Field';
import { DetailRow } from '../../components/ui/List';
import DocumentViewer from './DocumentViewer';
import ReauthSheet from './ReauthSheet';
import { personName } from './personName';
import { adminApi } from '../../services/api/endpoints/adminApi';
import { getErrorMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/formatters';
import { kycStatusMeta, KYC_METHOD_LABEL, KYC_DOCUMENT_LABEL, TIER_LABEL } from '../../constants/kyc';
import { AML_RULE_LABEL, AML_SEVERITY_TONE } from '../../constants/admin';

const TEXTAREA = 'w-full rounded-control border border-border bg-surface px-3 py-2.5 text-sm text-text focus:border-accent';

const OUTCOMES = [
    { value: 'VERIFIED', label: 'Verified' },
    { value: 'REQUIRES_ACTION', label: 'Request action' },
    { value: 'REJECTED', label: 'Reject' },
];

/**
 * One KYC submission and the decision on it (plan.md §0.20.2).
 *
 * Evidence before action, as in the risk sheet: applicant, identifiers (masked
 * until deliberately revealed), screening, documents, prior decisions — then
 * the form. The decision records *how* the identity was checked (method,
 * reference) as well as the outcome, because "Mark as Verified" records the
 * outcome of a procedure performed elsewhere; the click is not the check.
 *
 * Every decision is re-authenticated. The server refuses a decision from anyone
 * but the reviewer who claimed the submission, and on the reviewer's own.
 */
const KycReviewSheet = ({ submissionId, onClose, onChanged, currentUserId }) => {
    const [detail, setDetail] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [pan, setPan] = useState(null);
    const [form, setForm] = useState({ status: 'VERIFIED', method: 'document_review', tier: 'basic', reference: '', notes: '', userVisibleReason: '', requestedActions: '' });
    const [confirm, setConfirm] = useState(null); // 'decide' | 'revoke'

    const load = useCallback(async () => {
        if (!submissionId) return;
        setError(null);
        try {
            setDetail((await adminApi.getKyc(submissionId)).data);
        } catch (err) {
            setError(getErrorMessage(err, 'Could not load this submission.'));
        }
    }, [submissionId]);

    useEffect(() => {
        setDetail(null);
        setPan(null);
        setForm({ status: 'VERIFIED', method: 'document_review', tier: 'basic', reference: '', notes: '', userVisibleReason: '', requestedActions: '' });
        load();
    }, [load]);

    const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value?.target ? value.target.value : value }));
    const loadDocument = useCallback((documentId) => adminApi.getKycDocument(submissionId, documentId), [submissionId]);

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
            await load();
        } finally {
            setBusy(false);
        }
    };

    const payload = (currentPassword) => ({
        status: form.status,
        method: form.status === 'VERIFIED' ? form.method : undefined,
        tier: form.status === 'VERIFIED' ? form.tier : undefined,
        reference: form.reference.trim() || undefined,
        notes: form.notes.trim(),
        userVisibleReason: form.userVisibleReason.trim() || undefined,
        requestedActions: form.requestedActions.split('\n').map((a) => a.trim()).filter(Boolean),
        currentPassword,
    });

    const s = detail?.submission;
    const status = s?.status;
    const mine = s && String(s.assignedTo?._id) === String(currentUserId);
    const needsReason = form.status !== 'VERIFIED' || confirm === 'revoke';
    const formReady = form.notes.trim().length >= 10
        && (!needsReason || form.userVisibleReason.trim())
        && (form.status !== 'REQUIRES_ACTION' || form.requestedActions.trim());

    const decisionForm = (revoking) => (
        <div className="space-y-4">
            {!revoking && (
                <SegmentedControl label="Outcome" options={OUTCOMES} value={form.status} onChange={set('status')} className="w-full" />
            )}
            {!revoking && form.status === 'VERIFIED' && (
                <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="How it was verified">
                        {(props) => (
                            <Select {...props} value={form.method} onChange={set('method')}>
                                {Object.entries(KYC_METHOD_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </Select>
                        )}
                    </Field>
                    <Field label="Tier">
                        {(props) => (
                            <Select {...props} value={form.tier} onChange={set('tier')}>
                                <option value="basic">Basic</option>
                                <option value="full">Full</option>
                            </Select>
                        )}
                    </Field>
                    <Field label="Case reference" hint="Internal, optional.">
                        {(props) => <Input {...props} value={form.reference} onChange={set('reference')} maxLength={80} />}
                    </Field>
                </div>
            )}
            <Field label="Internal notes" hint="What you checked and why. Kept in the permanent record; never shown to the customer.">
                {(props) => <textarea {...props} rows={3} maxLength={2000} value={form.notes} onChange={set('notes')} className={TEXTAREA} />}
            </Field>
            {(revoking || form.status !== 'VERIFIED') && (
                <Field label="Reason the customer sees" hint="Plain words. No internal detail.">
                    {(props) => <textarea {...props} rows={2} maxLength={500} value={form.userVisibleReason} onChange={set('userVisibleReason')} className={TEXTAREA} />}
                </Field>
            )}
            {(revoking || form.status === 'REQUIRES_ACTION') && (
                <Field label="What they need to do" hint="One per line. Shown to the customer as a checklist.">
                    {(props) => <textarea {...props} rows={3} value={form.requestedActions} onChange={set('requestedActions')} className={TEXTAREA} />}
                </Field>
            )}
        </div>
    );

    let footer = null;
    if (s && !s.isOwn) {
        if (status === 'PENDING') {
            footer = <div className="flex justify-end"><Button variant="primary" loading={busy} onClick={() => act(() => adminApi.claimKyc(s._id), 'Picked up. It is yours to decide.')}>Start review</Button></div>;
        } else if (status === 'UNDER_REVIEW' && mine) {
            footer = (
                <div className="space-y-4">
                    {decisionForm(false)}
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button variant="ghost" disabled={busy} onClick={() => act(() => adminApi.releaseKyc(s._id, {}), 'Returned to the queue.')}>Return to queue</Button>
                        <Button variant="primary" disabled={!formReady || busy} onClick={() => setConfirm('decide')}>
                            {form.status === 'VERIFIED' ? 'Mark as verified' : form.status === 'REJECTED' ? 'Reject' : 'Request action'}
                        </Button>
                    </div>
                </div>
            );
        } else if (status === 'UNDER_REVIEW') {
            footer = <p className="text-sm text-text-muted">Being reviewed by {personName(s.assignedTo)}.</p>;
        } else if (status === 'VERIFIED') {
            footer = (
                <details className="rounded-control border border-border p-3">
                    <summary className="cursor-pointer text-sm font-medium text-text">Revoke verification</summary>
                    <p className="my-3 text-xs leading-5 text-text-muted">The customer goes back to the unverified tier at once and is asked to verify again.</p>
                    {decisionForm(true)}
                    <div className="mt-3 flex justify-end">
                        <Button variant="danger" disabled={busy || form.notes.trim().length < 10 || !form.userVisibleReason.trim() || !form.requestedActions.trim()} onClick={() => setConfirm('revoke')}>Revoke</Button>
                    </div>
                </details>
            );
        }
    }

    return (
        <>
            <Sheet
                open={Boolean(submissionId)}
                onClose={onClose}
                title="Identity check"
                description={s ? `${personName(s.userId)} · submitted ${formatDateTime(s.submittedAt)}` : undefined}
                size="lg"
                dismissible={!busy}
                footer={footer}
            >
                {error ? (
                    <p role="alert" className="py-6 text-center text-sm text-danger">{error}</p>
                ) : !s ? (
                    <div className="grid place-items-center py-10"><Spinner /></div>
                ) : (
                    <div className="space-y-6">
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge tone={kycStatusMeta(status).tone} dot>{kycStatusMeta(status).label}</Badge>
                            <Badge tone="neutral">{TIER_LABEL[s.userId?.kycTier] ?? 'Unverified'} tier</Badge>
                            {s.submissionCount > 1 && <Badge tone="neutral">Submission {s.submissionCount}</Badge>}
                        </div>

                        {s.isOwn && (
                            <p className="rounded-control bg-warning-soft px-3 py-2 text-sm text-warning">This is your own submission. Another admin has to review it.</p>
                        )}
                        {detail.sharedPanAccounts > 0 && (
                            <p className="flex items-start gap-2 rounded-control bg-negative-soft px-3 py-2 text-sm text-negative">
                                <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                                This PAN is also on {detail.sharedPanAccounts} other account(s).
                            </p>
                        )}

                        <dl className="divide-y divide-border">
                            <DetailRow label="Legal name" value={s.applicant.legalName} />
                            <DetailRow label="Account name" value={`${personName(s.userId)} (${s.userId?.email ?? '—'})`} />
                            <DetailRow label="Date of birth" value={new Date(s.applicant.dateOfBirth).toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })} />
                            <DetailRow
                                label="Address"
                                value={[s.applicant.address.line1, s.applicant.address.line2, s.applicant.address.city, s.applicant.address.state, s.applicant.address.postalCode].filter(Boolean).join(', ')}
                            />
                            <DetailRow
                                label="PAN"
                                value={
                                    <span className="inline-flex items-center gap-2">
                                        <span className="font-mono">{pan ?? s.identifiers?.panMasked}</span>
                                        {!pan && (
                                            <button
                                                type="button"
                                                className="text-xs font-medium text-accent-text hover:underline"
                                                onClick={async () => {
                                                    try { setPan((await adminApi.revealPan(s._id)).data.pan); } catch (err) { toast.error(getErrorMessage(err, 'Could not reveal.')); }
                                                }}
                                            >
                                                Reveal (audited)
                                            </button>
                                        )}
                                    </span>
                                }
                            />
                            {s.identifiers?.aadhaarMasked && <DetailRow label="Aadhaar" value={s.identifiers.aadhaarMasked} />}
                            <DetailRow label="Email verified" value={s.userId?.emailVerified ? 'Yes' : 'No'} />
                        </dl>

                        <section>
                            <h3 className="mb-2 text-sm font-semibold text-text">Screening and AML</h3>
                            {detail.amlAlerts?.length ? (
                                <ul className="space-y-2">
                                    {detail.amlAlerts.map((a) => (
                                        <li key={a._id} className="rounded-control bg-surface-sunken px-3 py-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Badge tone={AML_SEVERITY_TONE[a.severity]} size="sm">{AML_RULE_LABEL[a.rule] ?? a.rule}</Badge>
                                                <Badge tone={a.status === 'open' ? 'warning' : 'neutral'} size="sm">{a.status === 'open' ? 'Open' : 'Closed'}</Badge>
                                            </div>
                                            <p className="mt-1 text-xs leading-5 text-text-muted">{a.detail}</p>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-sm text-text-muted">
                                    {s.screening?.screenedAt ? `Screened ${formatDateTime(s.screening.screenedAt)}. No matches.` : 'Not screened yet (no watchlist imported, or screening is still running).'}
                                </p>
                            )}
                        </section>

                        <section>
                            <h3 className="mb-2 text-sm font-semibold text-text">Documents</h3>
                            <DocumentViewer documents={detail.documents} typeLabels={KYC_DOCUMENT_LABEL} load={loadDocument} />
                        </section>

                        {detail.decisions?.length > 0 && (
                            <section>
                                <h3 className="mb-2 text-sm font-semibold text-text">Decisions</h3>
                                <ul className="space-y-2">
                                    {detail.decisions.map((d) => (
                                        <li key={d._id} className="rounded-control border border-border px-3 py-2.5 text-xs leading-5">
                                            <p className="font-medium text-text">
                                                {kycStatusMeta(d.previousStatus).label} → {kycStatusMeta(d.newStatus).label} · tier {d.tierBefore} → {d.tierAfter}
                                            </p>
                                            <p className="text-text-muted">
                                                {formatDateTime(d.at)} by {personName(d.actorId)}{d.method ? ` · ${KYC_METHOD_LABEL[d.method] ?? d.method}` : ''}{d.reference ? ` · ref ${d.reference}` : ''}
                                            </p>
                                            <p className="mt-1 whitespace-pre-wrap text-text">{d.notes}</p>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}
                    </div>
                )}
            </Sheet>

            <ReauthSheet
                open={Boolean(confirm)}
                onClose={() => setConfirm(null)}
                loading={busy}
                variant={confirm === 'revoke' || form.status === 'REJECTED' ? 'danger' : 'primary'}
                title={confirm === 'revoke' ? 'Revoke this verification?' : form.status === 'VERIFIED' ? 'Mark as verified?' : form.status === 'REJECTED' ? 'Reject this submission?' : 'Ask the customer for more?'}
                description={confirm === 'revoke'
                    ? 'Their tier returns to unverified immediately, and they are notified.'
                    : form.status === 'VERIFIED'
                      ? `You are recording that the approved verification procedure was completed. Their tier becomes ${TIER_LABEL[form.tier]}.`
                      : 'The customer is notified with the reason you wrote.'}
                confirmLabel={confirm === 'revoke' ? 'Revoke' : 'Record decision'}
                onConfirm={(currentPassword) => (confirm === 'revoke'
                    ? act(() => adminApi.revokeKyc(s._id, payload(currentPassword)), 'Verification revoked.')
                    : act(() => adminApi.decideKyc(s._id, payload(currentPassword)), 'Decision recorded.'))}
            />
        </>
    );
};

export default KycReviewSheet;
