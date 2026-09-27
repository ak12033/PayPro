import React, { useEffect, useState } from 'react';
import Sheet from '../../components/ui/Sheet';
import Button from '../../components/ui/Button';
import Field, { Input, AmountInput, Select } from '../../components/ui/Field';
import { ASSET_TYPES, LIABILITY_KINDS } from './portfolio';

const rupees = (minor) => (minor == null ? '' : String(minor / 100));

/**
 * Add or edit one holding (`kind="holding"`) or one debt (`kind="liability"`).
 * One sheet for both because they are the same gesture — "write down a number
 * you know" — and differ only in which fields there are.
 */
const PortfolioEntrySheet = ({ open, onClose, onSave, onRemove, kind, entry, saving }) => {
    const isHolding = kind === 'holding';
    const [form, setForm] = useState({});

    useEffect(() => {
        if (!open) return;
        setForm(isHolding
            ? {
                assetType: entry?.assetType ?? 'mf',
                name: entry?.name ?? '',
                identifier: entry?.identifier ?? '',
                units: entry?.units ?? '',
                costBasis: rupees(entry?.costBasisMinor),
                currentValue: rupees(entry?.currentValueMinor),
                notes: entry?.notes ?? '',
            }
            : {
                kind: entry?.kind ?? 'personal_loan',
                lender: entry?.lender ?? '',
                outstanding: rupees(entry?.outstandingMinor),
                emi: rupees(entry?.emiMinor),
                interestRate: entry?.interestRate ?? '',
                emiDueDay: entry?.emiDueDay ?? '',
                notes: entry?.notes ?? '',
            });
    }, [open, entry, isHolding]);

    const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value?.target ? value.target.value : value }));

    const valid = isHolding
        ? form.name?.trim() && form.costBasis !== '' && form.currentValue !== ''
        : form.lender?.trim() && form.outstanding !== '';

    const save = () => {
        const payload = { ...form };
        for (const key of ['units', 'emi', 'interestRate', 'emiDueDay']) {
            if (payload[key] === '') payload[key] = null;
            else if (payload[key] != null && key !== 'emi') payload[key] = Number(payload[key]);
        }
        onSave(payload);
    };

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title={`${entry ? 'Edit' : 'Add'} ${isHolding ? 'an investment' : 'a debt'}`}
            description="Enter what you know. You can update it any time."
            dismissible={!saving}
            footer={
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                    {entry && onRemove ? <Button variant="ghost" onClick={onRemove} disabled={saving}>Remove</Button> : <span />}
                    <div className="flex flex-col-reverse gap-2 sm:flex-row">
                        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
                        <Button variant="primary" onClick={save} loading={saving} disabled={!valid}>Save</Button>
                    </div>
                </div>
            }
        >
            {isHolding ? (
                <div className="space-y-5">
                    <Field label="Type">
                        {(props) => (
                            <Select {...props} value={form.assetType} onChange={set('assetType')}>
                                {ASSET_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                            </Select>
                        )}
                    </Field>
                    <Field label="Name" required>
                        {(props) => <Input {...props} value={form.name ?? ''} onChange={set('name')} maxLength={120} placeholder="e.g. Index fund, bank FD" />}
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Amount invested" required>
                            {(props) => <AmountInput {...props} value={form.costBasis ?? ''} onChange={set('costBasis')} />}
                        </Field>
                        <Field label="Current value" hint="Your latest figure." required>
                            {(props) => <AmountInput {...props} value={form.currentValue ?? ''} onChange={set('currentValue')} />}
                        </Field>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Units" hint="Optional.">
                            {(props) => <Input {...props} value={form.units ?? ''} onChange={set('units')} inputMode="decimal" />}
                        </Field>
                        <Field label="Ticker, ISIN or folio" hint="Optional, for your reference.">
                            {(props) => <Input {...props} value={form.identifier ?? ''} onChange={set('identifier')} maxLength={40} />}
                        </Field>
                    </div>
                </div>
            ) : (
                <div className="space-y-5">
                    <Field label="Type">
                        {(props) => (
                            <Select {...props} value={form.kind} onChange={set('kind')}>
                                {LIABILITY_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                            </Select>
                        )}
                    </Field>
                    <Field label="Lender" required>
                        {(props) => <Input {...props} value={form.lender ?? ''} onChange={set('lender')} maxLength={120} />}
                    </Field>
                    <Field label="Amount outstanding" required>
                        {(props) => <AmountInput {...props} value={form.outstanding ?? ''} onChange={set('outstanding')} />}
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-3">
                        <Field label="Monthly EMI" hint="Optional.">
                            {(props) => <AmountInput {...props} value={form.emi ?? ''} onChange={set('emi')} />}
                        </Field>
                        <Field label="Interest % a year" hint="Optional.">
                            {(props) => <Input {...props} value={form.interestRate ?? ''} onChange={set('interestRate')} inputMode="decimal" />}
                        </Field>
                        <Field label="EMI day" hint="1 to 28.">
                            {(props) => <Input {...props} value={form.emiDueDay ?? ''} onChange={set('emiDueDay')} inputMode="numeric" maxLength={2} />}
                        </Field>
                    </div>
                </div>
            )}
        </Sheet>
    );
};

export default PortfolioEntrySheet;
