import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Sheet from '../../components/ui/Sheet';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Amount from '../../components/ui/Amount';
import Field, { Input, Select } from '../../components/ui/Field';
import { DetailRow } from '../../components/ui/List';
import useQuery from '../../hooks/useQuery';
import { billPaymentApi } from '../../services/api/endpoints/billPaymentApi';
import { createIdempotencyKey } from '../../lib/idempotency';
import { getErrorMessage } from '../../utils/errors';

/**
 * Pay a bill through the provider (plan.md §19.3). Only rendered when the
 * server reports a provider; today that can only be the **demo** biller, which
 * takes real wallet money and pays nobody — so "Demo" is in the title, the
 * badge and the confirm button, not in small print.
 *
 * Two steps, fetch then pay: the amount paid is the biller's figure, which the
 * server fetches again at payment time, never a number typed here.
 */
const PayBillSheet = ({ open, onClose, mode, reminder, onPaid }) => {
    const demo = mode === 'demo';
    const billers = useQuery(async () => (await billPaymentApi.billers()).data?.billers ?? [], { enabled: open });
    const [billerId, setBillerId] = useState('');
    const [customerRef, setCustomerRef] = useState('');
    const [bill, setBill] = useState(null);
    const [busy, setBusy] = useState(false);
    const [key, setKey] = useState(createIdempotencyKey);

    useEffect(() => {
        if (!open) return;
        setBill(null);
        setCustomerRef(reminder?.customerRef ?? '');
        setKey(createIdempotencyKey());
    }, [open, reminder]);

    const biller = (billers.data ?? []).find((b) => b.id === (billerId || billers.data?.[0]?.id));

    const fetchBill = async () => {
        setBusy(true);
        try {
            const { data } = await billPaymentApi.fetch({ billerId: biller.id, customerRef: customerRef.trim().toUpperCase() });
            setBill(data.bill);
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not fetch this bill.'));
        } finally {
            setBusy(false);
        }
    };

    const pay = async () => {
        setBusy(true);
        try {
            const { data } = await billPaymentApi.pay({ billerId: bill.billerId, customerRef: bill.customerRef, billId: reminder?._id, idempotencyKey: key });
            if (data.status === 'SUCCESS') {
                toast.success(demo ? 'Demo payment recorded.' : 'Bill paid.');
                onPaid?.();
                onClose();
            } else {
                toast.error(`${data.failureReason ?? 'The biller declined this payment.'} Your money is back in your balance.`);
                setKey(createIdempotencyKey());
            }
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not pay this bill.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title={demo ? 'Pay a bill (Demo)' : 'Pay a bill'}
            description={demo
                ? 'Demo mode: this debits your PayPro balance but no real biller is paid. It exists to test the payment flow.'
                : 'Paid from your PayPro balance.'}
            dismissible={!busy}
            footer={
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button variant="secondary" onClick={bill ? () => setBill(null) : onClose} disabled={busy}>{bill ? 'Back' : 'Cancel'}</Button>
                    {bill ? (
                        <Button variant="primary" onClick={pay} loading={busy}>{demo ? 'Pay (demo)' : 'Pay'}</Button>
                    ) : (
                        <Button variant="primary" onClick={fetchBill} loading={busy} disabled={!biller || !customerRef.trim()}>Fetch bill</Button>
                    )}
                </div>
            }
        >
            {demo && <Badge tone="warning" className="mb-4">Demo — no real payment</Badge>}
            {bill ? (
                <dl className="divide-y divide-border">
                    <DetailRow label="Biller" value={bill.billerName} />
                    <DetailRow label={biller?.customerRefLabel ?? 'Reference'} value={bill.customerRef} />
                    <DetailRow label="Bill number" value={bill.billNumber} />
                    <DetailRow label="Due" value={bill.dueDate} />
                    <DetailRow label="Amount due" value={<Amount minor={bill.amountMinor} size="sm" />} />
                </dl>
            ) : (
                <div className="space-y-5">
                    <Field label="Biller">
                        {(props) => (
                            <Select {...props} value={biller?.id ?? ''} onChange={(e) => setBillerId(e.target.value)}>
                                {(billers.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </Select>
                        )}
                    </Field>
                    <Field label={biller?.customerRefLabel ?? 'Your reference'} hint={demo ? 'Any valid-looking number. One ending in 0000 is declined, to show what that looks like.' : undefined}>
                        {(props) => <Input {...props} value={customerRef} onChange={(e) => setCustomerRef(e.target.value)} autoComplete="off" maxLength={40} />}
                    </Field>
                </div>
            )}
        </Sheet>
    );
};

export default PayBillSheet;
