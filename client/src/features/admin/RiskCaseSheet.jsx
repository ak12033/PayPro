import React, { useEffect, useState } from 'react';
import Sheet from '../../components/ui/Sheet';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Amount from '../../components/ui/Amount';
import Spinner from '../../components/ui/Spinner';
import { DetailRow } from '../../components/ui/List';
import { personName } from './personName';
import { formatDateTime, formatRelativeTime } from '../../utils/formatters';
import { RISK_ACTION_LABEL, RISK_STATUS_LABEL, RISK_STATUS_TONE, can } from '../../constants/admin';

const name = (person) => personName(person, '—');

/**
 * One risk case, and the decision on it.
 *
 * Shows *why* before offering *what to do*: the rules that fired, with their
 * weights, sit above the buttons, and the model's contribution is shown apart
 * from them — it is one weighted input, never the verdict (context.md §5.13),
 * and a reviewer who sees a single blended score cannot tell the two apart.
 *
 * The approve copy states the consequence plainly, because it is not what most
 * people would guess: approving does **not** send the money. It clears the
 * hold and tells the customer to try again (plan.md §0.13).
 */
const RiskCaseSheet = ({ open, onClose, riskCase, loading, error, onDecide, onEscalate, deciding, role }) => {
    const [notes, setNotes] = useState('');

    useEffect(() => {
        if (!open) setNotes('');
    }, [open]);

    const isOpenCase = riskCase?.status === 'open';
    /**
     * Escalation (plan.md §28.2) hands the case to an admin: from then on only
     * an admin can decide it, and an admin has no one further to escalate to.
     * The server enforces both; this only stops offering buttons that would 403.
     */
    const escalated = Boolean(riskCase?.escalation?.at);
    const decidable = isOpenCase && (!escalated || role === 'admin');
    const escalatable = isOpenCase && !escalated && role !== 'admin' && can(role, 'escalateRisk') && Boolean(onEscalate);
    const reasonReady = notes.trim().length >= 10;

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title="Risk case"
            description={riskCase ? `${name(riskCase.userId)} · raised ${formatRelativeTime(riskCase.createdAt)}` : undefined}
            size="lg"
            dismissible={!deciding}
            footer={
                decidable ? (
                    <div className="space-y-3">
                        <textarea
                            value={notes}
                            onChange={(event) => setNotes(event.target.value)}
                            rows={2}
                            maxLength={1000}
                            placeholder="Reviewer notes (kept in the audit log)"
                            aria-label="Reviewer notes"
                            className="w-full rounded-control border border-border bg-surface px-3 py-2.5 text-sm text-text focus:border-accent"
                        />
                        <p className="text-xs leading-5 text-text-muted">
                            Approving clears the hold — it does not send the money. The customer is told they can
                            send it again, and the retry goes through the same checks.
                        </p>
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            {escalatable && (
                                <Button
                                    variant="ghost"
                                    onClick={() => onEscalate(notes.trim())}
                                    disabled={deciding || !reasonReady}
                                    title={reasonReady ? undefined : 'Write why in the notes first (at least 10 characters)'}
                                >
                                    Escalate to admin
                                </Button>
                            )}
                            <Button variant="secondary" onClick={() => onDecide('rejected', notes)} disabled={deciding}>
                                Reject
                            </Button>
                            <Button variant="primary" onClick={() => onDecide('approved', notes)} loading={deciding}>
                                Approve
                            </Button>
                        </div>
                        {escalatable && (
                            <p className="text-xs leading-5 text-text-muted">
                                Not sure? Escalating makes the case urgent, hands it to an admin, and pushes a hold&apos;s
                                auto-release back 24 hours, once. Your notes become the reason.
                            </p>
                        )}
                    </div>
                ) : isOpenCase && escalated ? (
                    <p className="text-sm text-text-muted">Escalated to an admin. Waiting for their decision.</p>
                ) : null
            }
        >
            {error ? (
                <p role="alert" className="py-6 text-center text-sm text-danger">{error}</p>
            ) : loading || !riskCase ? (
                <div className="grid place-items-center py-10"><Spinner /></div>
            ) : (
                <div className="space-y-5">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={RISK_STATUS_TONE[riskCase.status]} dot>{RISK_STATUS_LABEL[riskCase.status]}</Badge>
                        <Badge tone={riskCase.action === 'block' ? 'negative' : 'warning'}>
                            {RISK_ACTION_LABEL[riskCase.action]}
                        </Badge>
                        {riskCase.priority === 'urgent' && <Badge tone="negative">Urgent</Badge>}
                        {escalated && <Badge tone="info">Escalated</Badge>}
                    </div>

                    <dl className="divide-y divide-border">
                        <DetailRow label="Customer" value={`${name(riskCase.userId)} (${riskCase.userId?.email ?? '—'})`} />
                        <DetailRow label="Amount" value={<Amount value={riskCase.intent?.amount} size="sm" />} />
                        <DetailRow label="Recipient" value={riskCase.intent?.recipientName || '—'} />
                        <DetailRow label="Score" value={`${riskCase.score} / 100`} />
                        <DetailRow label="Raised" value={formatDateTime(riskCase.createdAt)} />
                        {riskCase.autoReleaseAt && isOpenCase && (
                            <DetailRow
                                label="Auto-releases"
                                value={`${formatDateTime(riskCase.autoReleaseAt)} (${formatRelativeTime(riskCase.autoReleaseAt)})`}
                                tone="text-warning"
                            />
                        )}
                        {escalated && (
                            <DetailRow
                                label="Escalated"
                                value={`${formatDateTime(riskCase.escalation.at)}${riskCase.escalation.by ? ` by ${name(riskCase.escalation.by)}` : ''}: ${riskCase.escalation.reason}`}
                            />
                        )}
                        {riskCase.reviewedAt && (
                            <DetailRow
                                label="Decided"
                                value={`${formatDateTime(riskCase.reviewedAt)}${riskCase.reviewedBy ? ` by ${name(riskCase.reviewedBy)}` : ' (automatically)'}`}
                            />
                        )}
                    </dl>

                    <section aria-labelledby="rules-heading">
                        <h3 id="rules-heading" className="mb-2 text-sm font-semibold text-text">Rules that fired</h3>
                        {riskCase.rules?.length ? (
                            <ul className="space-y-2">
                                {riskCase.rules.map((rule) => (
                                    <li key={rule.code} className="rounded-control bg-surface-sunken px-3 py-2.5">
                                        <div className="flex items-center justify-between gap-3">
                                            <code className="text-xs font-medium text-text">{rule.code}</code>
                                            <span className="text-xs tabular-nums text-text-muted">+{rule.weight}</span>
                                        </div>
                                        {rule.detail && <p className="mt-1 text-xs leading-5 text-text-muted">{rule.detail}</p>}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-text-muted">No deterministic rule fired.</p>
                        )}
                    </section>

                    <section aria-labelledby="model-heading" className="rounded-control border border-border px-3 py-2.5">
                        <h3 id="model-heading" className="text-sm font-semibold text-text">Model signal</h3>
                        <p className="mt-1 text-xs leading-5 text-text-muted">
                            {riskCase.modelScore === null || riskCase.modelScore === undefined
                                ? 'The model was unavailable for this transfer; only the rules above were scored.'
                                : `Model score ${riskCase.modelScore}/100 — one weighted input to the total, not the verdict.`}
                            {riskCase.modelReason ? ` “${riskCase.modelReason}”` : ''}
                        </p>
                    </section>

                    {riskCase.notes && (
                        <section>
                            <h3 className="mb-1 text-sm font-semibold text-text">Notes</h3>
                            <p className="whitespace-pre-wrap text-sm text-text-muted">{riskCase.notes}</p>
                        </section>
                    )}
                </div>
            )}
        </Sheet>
    );
};

export default RiskCaseSheet;
