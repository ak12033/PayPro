import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Sheet from '../../components/ui/Sheet';
import Button from '../../components/ui/Button';
import Field, { Input, Select } from '../../components/ui/Field';

/**
 * Open a support ticket (plan.md §27.2/§27.3).
 *
 * The fraud category shows a warning before the form is submitted, not after.
 * That is not a scare: choosing it escalates the ticket to urgent and opens a
 * risk case for a human to review, and someone should know that is what they
 * are doing before they pick it off a dropdown to mean "this is annoying".
 */
const CATEGORIES = [
    { value: 'transaction', label: 'A transaction' },
    { value: 'payment', label: 'A top-up or payment' },
    { value: 'account', label: 'My account' },
    { value: 'security', label: 'Security' },
    { value: 'fraud', label: 'Report fraud' },
    { value: 'other', label: 'Something else' },
];

const NewTicketSheet = ({ open, onClose, onSubmit, submitting, relatedTransaction }) => {
    const [category, setCategory] = useState('transaction');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');

    useEffect(() => {
        if (!open) return;
        // Pre-filled when opened from a transaction (§27.3's entry points), so
        // the user doesn't have to describe which one they mean.
        setCategory(relatedTransaction ? 'transaction' : 'account');
        setSubject(relatedTransaction ? `About "${relatedTransaction.description}"` : '');
        setBody('');
    }, [open, relatedTransaction]);

    const valid = subject.trim().length > 0 && body.trim().length > 0;

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title="Get help"
            description="Tell us what happened and we'll look into it."
            size="md"
            footer={
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
                    <Button
                        variant="primary"
                        onClick={() => onSubmit({
                            category,
                            subject: subject.trim(),
                            body: body.trim(),
                            relatedTransactionId: relatedTransaction?._id,
                        })}
                        loading={submitting}
                        disabled={!valid}
                    >
                        Send
                    </Button>
                </div>
            }
        >
            <div className="space-y-5">
                <Field label="What's this about?">
                    {(props) => (
                        <Select {...props} value={category} onChange={(e) => setCategory(e.target.value)}>
                            {CATEGORIES.map((c) => (
                                <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                        </Select>
                    )}
                </Field>

                {category === 'fraud' && (
                    <p className="flex items-start gap-2 rounded-control bg-warning-soft p-3 text-xs leading-5 text-warning">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                        <span>
                            This goes straight to our security team as urgent. If money is still
                            moving, change your password and sign out everywhere first — that stops
                            it now, while a ticket is being read.
                        </span>
                    </p>
                )}

                <Field label="Subject" required>
                    {(props) => (
                        <Input
                            {...props}
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder="A short summary"
                            maxLength={140}
                        />
                    )}
                </Field>

                <Field label="What happened?" required hint="Dates, amounts and what you expected all help.">
                    {(props) => (
                        <textarea
                            {...props}
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            rows={6}
                            maxLength={4000}
                            className="w-full rounded-control border border-border bg-surface px-3 py-2.5 text-sm text-text focus:border-accent"
                        />
                    )}
                </Field>

                {/* §27.3: attachments need object storage, which does not exist. */}
                <p className="text-xs text-text-muted">
                    Text only for now — please don't paste passwords, OTPs or card numbers.
                </p>
            </div>
        </Sheet>
    );
};

export default NewTicketSheet;
