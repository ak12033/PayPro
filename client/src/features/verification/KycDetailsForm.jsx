import React, { useEffect, useState } from 'react';
import Button from '../../components/ui/Button';
import Field, { Input } from '../../components/ui/Field';
import { PAN_PATTERN } from '../../constants/kyc';

const empty = { legalName: '', dateOfBirth: '', line1: '', line2: '', city: '', state: '', postalCode: '', pan: '', aadhaarLast4: '' };

/**
 * The identity details a reviewer checks the documents against (plan.md
 * §0.20.2). The PAN is never pre-filled from the server — only its masked form
 * exists client-side — so correcting details means typing it again.
 *
 * Validation here mirrors the server's so the form can point at the field; the
 * server's answer is still the one that counts, and its message is shown if it
 * disagrees.
 */
const KycDetailsForm = ({ initial, submitLabel, onSubmit, saving }) => {
    const [form, setForm] = useState(empty);
    const [touched, setTouched] = useState(false);

    useEffect(() => {
        if (!initial) return;
        setForm({
            ...empty,
            legalName: initial.legalName ?? '',
            dateOfBirth: initial.dateOfBirth ? new Date(initial.dateOfBirth).toISOString().slice(0, 10) : '',
            line1: initial.address?.line1 ?? '',
            line2: initial.address?.line2 ?? '',
            city: initial.address?.city ?? '',
            state: initial.address?.state ?? '',
            postalCode: initial.address?.postalCode ?? '',
        });
    }, [initial]);

    const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

    const pan = form.pan.replace(/\s/g, '').toUpperCase();
    const errors = {
        legalName: form.legalName.trim().length < 2
            ? 'Enter your full legal name'
            : !/^\p{L}[\p{L} .'-]*$/u.test(form.legalName.trim()) ? 'Use letters only, as on your PAN card' : null,
        dateOfBirth: !form.dateOfBirth ? 'Enter your date of birth' : null,
        line1: !form.line1.trim() ? 'Enter your address' : null,
        city: !form.city.trim() ? 'Enter your city' : null,
        state: !form.state.trim() ? 'Enter your state' : null,
        postalCode: !/^[1-9][0-9]{5}$/.test(form.postalCode) ? 'Enter a 6-digit PIN code' : null,
        pan: !PAN_PATTERN.test(pan) ? 'Enter your PAN, for example ABCDE1234F' : null,
        aadhaarLast4: form.aadhaarLast4 && !/^\d{4}$/.test(form.aadhaarLast4) ? 'Only the last 4 digits' : null,
    };
    const valid = Object.values(errors).every((e) => !e);
    const show = (key) => (touched ? errors[key] : null);

    const submit = (event) => {
        event.preventDefault();
        setTouched(true);
        if (!valid) return;
        onSubmit({
            legalName: form.legalName.trim(),
            dateOfBirth: form.dateOfBirth,
            address: {
                line1: form.line1.trim(),
                line2: form.line2.trim(),
                city: form.city.trim(),
                state: form.state.trim(),
                postalCode: form.postalCode.trim(),
            },
            pan,
            aadhaarLast4: form.aadhaarLast4 || undefined,
        });
    };

    return (
        <form onSubmit={submit} noValidate className="space-y-5">
            <Field label="Full legal name" hint="Exactly as it appears on your PAN card." error={show('legalName')} required>
                {(props) => <Input {...props} value={form.legalName} onChange={set('legalName')} autoComplete="name" maxLength={120} />}
            </Field>

            <Field label="Date of birth" error={show('dateOfBirth')} required>
                {(props) => <Input {...props} type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} autoComplete="bday" />}
            </Field>

            <fieldset className="space-y-4">
                <legend className="text-sm font-medium text-text">Address</legend>
                <Field label="Address line 1" error={show('line1')} required>
                    {(props) => <Input {...props} value={form.line1} onChange={set('line1')} autoComplete="address-line1" maxLength={120} />}
                </Field>
                <Field label="Address line 2">
                    {(props) => <Input {...props} value={form.line2} onChange={set('line2')} autoComplete="address-line2" maxLength={120} />}
                </Field>
                <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="City" error={show('city')} required>
                        {(props) => <Input {...props} value={form.city} onChange={set('city')} autoComplete="address-level2" maxLength={60} />}
                    </Field>
                    <Field label="State" error={show('state')} required>
                        {(props) => <Input {...props} value={form.state} onChange={set('state')} autoComplete="address-level1" maxLength={60} />}
                    </Field>
                    <Field label="PIN code" error={show('postalCode')} required>
                        {(props) => <Input {...props} value={form.postalCode} onChange={set('postalCode')} inputMode="numeric" autoComplete="postal-code" maxLength={6} />}
                    </Field>
                </div>
            </fieldset>

            <Field label="PAN" hint="10 characters. Stored encrypted and shown only masked." error={show('pan')} required>
                {(props) => (
                    <Input
                        {...props}
                        value={form.pan}
                        onChange={set('pan')}
                        autoCapitalize="characters"
                        autoComplete="off"
                        spellCheck={false}
                        maxLength={10}
                        className="uppercase tracking-wider"
                    />
                )}
            </Field>

            <Field
                label="Last 4 digits of Aadhaar"
                hint="Optional. We never ask for your full Aadhaar number."
                error={show('aadhaarLast4')}
            >
                {(props) => (
                    <Input {...props} value={form.aadhaarLast4} onChange={set('aadhaarLast4')} inputMode="numeric" autoComplete="off" maxLength={4} className="max-w-32" />
                )}
            </Field>

            <Button type="submit" variant="primary" loading={saving} fullWidth>
                {submitLabel}
            </Button>
        </form>
    );
};

export default KycDetailsForm;
