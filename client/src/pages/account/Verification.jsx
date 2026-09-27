import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { BadgeCheck, ShieldCheck, Clock } from 'lucide-react';
import PageHeader, { SectionHeading } from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Amount from '../../components/ui/Amount';
import Skeleton from '../../components/ui/Skeleton';
import IconBadge from '../../components/ui/IconBadge';
import { DetailRow } from '../../components/ui/List';
import ErrorState from '../../components/feedback/ErrorState';
import KycDetailsForm from '../../features/verification/KycDetailsForm';
import DocumentUploader from '../../features/verification/DocumentUploader';
import useQuery from '../../hooks/useQuery';
import { useSocket } from '../../context/SocketContext';
import { kycApi } from '../../services/api/endpoints/kycApi';
import { getErrorMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/formatters';
import { kycStatusMeta, KYC_DOCUMENT_LABEL, KYC_PRIVACY_NOTE, TIER_LABEL } from '../../constants/kyc';

const MAX_DOCUMENTS = 8;

/**
 * Identity verification (plan.md §0.20.2), the holder's side.
 *
 * What this screen has to be honest about: a person at PayPro reviews what is
 * submitted, it is not instant, and "verified" is a decision someone recorded,
 * not something the page decides. So it always leads with the current status
 * and what happens next, then asks for whatever is missing.
 *
 * The details form is shown when there is nothing yet, after a rejection, when
 * the reviewer asked for something, or (collapsed) while still waiting for a
 * reviewer — never while someone is looking at it or after it is verified.
 */
const Verification = () => {
    const kyc = useQuery(async () => (await kycApi.getMine()).data);
    const { subscribe } = useSocket() ?? {};
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(false);

    // A decision arrives as an 'Account' notification; refresh when one lands.
    useEffect(() => {
        if (!subscribe) return undefined;
        return subscribe((event, payload) => {
            if (event === 'notification_received' && payload?.notification?.type === 'Account') kyc.refresh();
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subscribe]);

    const submission = kyc.data?.submission ?? null;
    const status = submission?.status;
    const meta = kycStatusMeta(status);

    const save = async (details) => {
        setSaving(true);
        try {
            const { data } = submission && status !== 'REJECTED'
                ? await kycApi.resubmit(submission._id, details)
                : await kycApi.submit(details);
            kyc.setData(data);
            setEditing(false);
            toast.success(status === 'REQUIRES_ACTION' ? 'Resubmitted for review.' : 'Details saved. Now add your documents.');
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not save your details.'));
        } finally {
            setSaving(false);
        }
    };

    const upload = async ({ type, file }) => {
        await kycApi.uploadDocument(submission._id, { type, file });
        toast.success('Uploaded.');
        kyc.refresh();
    };

    const remove = async (document) => {
        await kycApi.removeDocument(submission._id, document._id);
        kyc.refresh();
    };

    const showForm = !submission || status === 'REJECTED' || status === 'REQUIRES_ACTION' || (status === 'PENDING' && editing);

    return (
        <div className="mx-auto max-w-2xl">
            <PageHeader
                title="Identity verification"
                subtitle="Verifying your identity raises your limits and lets you withdraw to your bank account."
                back={true}
            />

            {kyc.error ? (
                <ErrorState title="Verification unavailable" message={kyc.error} onRetry={kyc.retry} reassurance={null} />
            ) : kyc.loading ? (
                <div className="space-y-4">
                    <Skeleton className="h-32 w-full" rounded="rounded-card" />
                    <Skeleton className="h-64 w-full" rounded="rounded-card" />
                </div>
            ) : (
                <div className="space-y-6">
                    {/* ----------------------------------------------- status */}
                    <Card>
                        <div className="flex items-start gap-3">
                            <IconBadge
                                icon={status === 'VERIFIED' ? <BadgeCheck size={18} /> : status ? <Clock size={18} /> : <ShieldCheck size={18} />}
                                tone={{ positive: 'positive', warning: 'warning', negative: 'warning' }[meta.tone] ?? 'accent'}
                            />
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-base font-semibold text-text">{meta.label}</p>
                                    <Badge tone="neutral" size="sm">{TIER_LABEL[kyc.data?.tier] ?? 'Unverified'} tier</Badge>
                                </div>
                                <p className="mt-1 text-sm leading-6 text-text-muted">{meta.description}</p>
                                {submission?.userVisibleReason && ['REJECTED', 'REQUIRES_ACTION'].includes(status) && (
                                    <p className="mt-2 text-sm leading-6 text-text">{submission.userVisibleReason}</p>
                                )}
                            </div>
                        </div>

                        {status === 'REQUIRES_ACTION' && submission.requestedActions?.length > 0 && (
                            <div className="mt-4 rounded-control bg-warning-soft px-3 py-2.5">
                                <p className="text-sm font-medium text-warning">What we need</p>
                                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-text">
                                    {submission.requestedActions.map((action) => <li key={action}>{action}</li>)}
                                </ul>
                            </div>
                        )}

                        {kyc.data?.limits && (
                            <dl className="mt-4 divide-y divide-border border-t border-border">
                                <DetailRow label="Per transaction" value={<Amount value={kyc.data.limits.perTxn} size="sm" />} />
                                <DetailRow label="Per day" value={<Amount value={kyc.data.limits.daily} size="sm" />} />
                                <DetailRow label="Per month" value={<Amount value={kyc.data.limits.monthly} size="sm" />} />
                                <DetailRow
                                    label="Maximum balance"
                                    value={kyc.data.limits.maxBalance == null ? 'No limit' : <Amount value={kyc.data.limits.maxBalance} size="sm" />}
                                />
                            </dl>
                        )}
                    </Card>

                    {/* ----------------------------------------------- details */}
                    {submission && !showForm && (
                        <section>
                            <SectionHeading
                                title="Your details"
                                action={status === 'PENDING' && (
                                    <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>Correct details</Button>
                                )}
                            />
                            <Card padding="md">
                                <dl className="divide-y divide-border">
                                    <DetailRow label="Legal name" value={submission.applicant.legalName} />
                                    <DetailRow label="Date of birth" value={new Date(submission.applicant.dateOfBirth).toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })} />
                                    <DetailRow label="PAN" value={submission.identifiers.panMasked} />
                                    {submission.identifiers.aadhaarMasked && <DetailRow label="Aadhaar" value={submission.identifiers.aadhaarMasked} />}
                                    <DetailRow label="Submitted" value={formatDateTime(submission.submittedAt)} />
                                </dl>
                            </Card>
                        </section>
                    )}

                    {showForm && (
                        <section>
                            <SectionHeading title={submission ? 'Update your details' : 'Your details'} />
                            <Card>
                                <KycDetailsForm
                                    initial={submission?.applicant}
                                    submitLabel={!submission ? 'Continue' : status === 'REQUIRES_ACTION' ? 'Resubmit for review' : status === 'REJECTED' ? 'Submit again' : 'Save changes'}
                                    onSubmit={save}
                                    saving={saving}
                                />
                                {status === 'PENDING' && (
                                    <Button variant="ghost" fullWidth className="mt-2" onClick={() => setEditing(false)} disabled={saving}>
                                        Cancel
                                    </Button>
                                )}
                            </Card>
                        </section>
                    )}

                    {/* ---------------------------------------------- documents */}
                    {submission && status !== 'REJECTED' && (
                        <section>
                            <SectionHeading title="Documents" />
                            <Card>
                                <p className="mb-4 text-sm leading-6 text-text-muted">
                                    {submission.editable
                                        ? 'Add a clear photo or scan of your PAN card, and a proof of address. A reviewer compares these with your details.'
                                        : 'Documents cannot be changed while your details are being reviewed.'}
                                </p>
                                <DocumentUploader
                                    documents={submission.documents}
                                    typeLabels={KYC_DOCUMENT_LABEL}
                                    onUpload={upload}
                                    onRemove={remove}
                                    editable={submission.editable}
                                    maxDocuments={MAX_DOCUMENTS}
                                />
                            </Card>
                        </section>
                    )}

                    <p className="px-1 text-xs leading-5 text-text-muted">{KYC_PRIVACY_NOTE}</p>
                </div>
            )}
        </div>
    );
};

export default Verification;
