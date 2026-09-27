import React, { useEffect, useState } from 'react';
import Sheet from '../../components/ui/Sheet';
import Button from '../../components/ui/Button';
import Field, { Input } from '../../components/ui/Field';

const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/**
 * Add a bank account to withdraw to (plan.md §0.20.3). The account number is
 * typed twice, like every bank's own form: a transposed digit here sends money
 * to a stranger, and there is no way to take it back from the app.
 */
const BankAccountSheet = ({ open, onClose, onSave, saving, defaultHolderName = '' }) => {
    const [holderName, setHolderName] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [confirmAccountNumber, setConfirmAccountNumber] = useState('');
    const [ifsc, setIfsc] = useState('');
    const [bankName, setBankName] = useState('');
    const [touched, setTouched] = useState(false);

    useEffect(() => {
        if (!open) return;
        setHolderName(defaultHolderName);
        setAccountNumber('');
        setConfirmAccountNumber('');
        setIfsc('');
        setBankName('');
        setTouched(false);
    }, [open, defaultHolderName]);

    const digits = accountNumber.replace(/\s/g, '');
    const code = ifsc.replace(/\s/g, '').toUpperCase();
    const errors = {
        holderName: holderName.trim().length < 2 ? 'Enter the name on the account' : null,
        accountNumber: !/^\d{9,18}$/.test(digits) ? 'Account numbers are 9 to 18 digits' : null,
        confirmAccountNumber: confirmAccountNumber.replace(/\s/g, '') !== digits ? 'The account numbers do not match' : null,
        ifsc: !IFSC_PATTERN.test(code) ? 'Enter an IFSC like HDFC0001234' : null,
    };
    const valid = Object.values(errors).every((e) => !e);
    const show = (key) => (touched ? errors[key] : null);

    const save = () => {
        setTouched(true);
        if (!valid) return;
        onSave({
            holderName: holderName.trim(),
            accountNumber: digits,
            confirmAccountNumber: confirmAccountNumber.replace(/\s/g, ''),
            ifsc: code,
            bankName: bankName.trim() || undefined,
        });
    };

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title="Add a bank account"
            description="It must be in your own name. We check it before any money can be sent to it."
            dismissible={!saving}
            footer={
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
                    <Button variant="primary" onClick={save} loading={saving}>Add account</Button>
                </div>
            }
        >
            <div className="space-y-5">
                <Field label="Account holder name" hint="As your bank has it." error={show('holderName')} required>
                    {(props) => <Input {...props} value={holderName} onChange={(e) => setHolderName(e.target.value)} autoComplete="name" maxLength={120} />}
                </Field>
                <Field label="Account number" error={show('accountNumber')} required>
                    {(props) => (
                        <Input {...props} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} inputMode="numeric" autoComplete="off" maxLength={22} />
                    )}
                </Field>
                <Field label="Confirm account number" error={show('confirmAccountNumber')} required>
                    {(props) => (
                        <Input
                            {...props}
                            value={confirmAccountNumber}
                            onChange={(e) => setConfirmAccountNumber(e.target.value)}
                            inputMode="numeric"
                            autoComplete="off"
                            maxLength={22}
                            onPaste={(e) => e.preventDefault()}
                        />
                    )}
                </Field>
                <Field label="IFSC" hint="On your cheque book or passbook." error={show('ifsc')} required>
                    {(props) => (
                        <Input {...props} value={ifsc} onChange={(e) => setIfsc(e.target.value)} autoCapitalize="characters" autoComplete="off" maxLength={11} className="uppercase tracking-wider" />
                    )}
                </Field>
                <Field label="Bank name" hint="Optional.">
                    {(props) => <Input {...props} value={bankName} onChange={(e) => setBankName(e.target.value)} maxLength={80} />}
                </Field>
            </div>
        </Sheet>
    );
};

export default BankAccountSheet;
