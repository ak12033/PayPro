import React, { useEffect, useState } from 'react';
import Sheet from '../../components/ui/Sheet';
import Button from '../../components/ui/Button';
import Field, { Input, AmountInput, Select } from '../../components/ui/Field';
import useQuery from '../../hooks/useQuery';
import { transactionApi } from '../../services/api/endpoints/transactionApi';
import { toRupees } from '../../constants/budget';
import { BILL_FREQUENCY_LABEL, BILL_DISCLAIMER } from '../../constants/recurring';

/** Today, as the `yyyy-mm-dd` a date input expects. */
const todayISO = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 10);
};

const toDateInput = (value) => (value ? new Date(value).toISOString().slice(0, 10) : todayISO());

/**
 * Add or edit a bill reminder (plan.md §19.2).
 *
 * The amount is optional, deliberately: a variable bill (electricity, a phone
 * plan that changes) is still worth being reminded about, and forcing a number
 * would push people to invent one that then shows up in a forecast as if it
 * were known.
 */
const BillEditorSheet = ({ open, onClose, onSave, bill, saving }) => {
    const categories = useQuery(
        async () => (await transactionApi.getCategories()).data?.categories ?? [],
        { enabled: open }
    );

    const [billerName, setBillerName] = useState('');
    const [category, setCategory] = useState('Bills');
    const [customerRef, setCustomerRef] = useState('');
    const [amount, setAmount] = useState('');
    const [dueDate, setDueDate] = useState(todayISO());
    const [frequency, setFrequency] = useState('monthly');
    const [reminderDaysBefore, setReminderDaysBefore] = useState('3');

    useEffect(() => {
        if (!open) return;
        setBillerName(bill?.billerName ?? '');
        setCategory(bill?.category ?? 'Bills');
        setCustomerRef(bill?.customerRef ?? '');
        setAmount(bill?.amountMinor != null ? String(toRupees(bill.amountMinor)) : '');
        setDueDate(toDateInput(bill?.dueDate));
        setFrequency(bill?.frequency ?? 'monthly');
        setReminderDaysBefore(String(bill?.reminderDaysBefore ?? 3));
    }, [open, bill]);

    const handleSave = () => {
        onSave({
            billerName: billerName.trim(),
            category,
            customerRef: customerRef.trim() || undefined,
            // Sent as rupees; the server converts and validates on the same
            // terms as any other amount.
            amount: amount ? Number(amount) : undefined,
            dueDate: new Date(dueDate).toISOString(),
            frequency,
            reminderDaysBefore: Number(reminderDaysBefore),
        });
    };

    const valid = billerName.trim().length > 0 && dueDate;

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title={bill ? 'Edit reminder' : 'Add a bill reminder'}
            description={BILL_DISCLAIMER}
            size="md"
            footer={
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
                    <Button variant="primary" onClick={handleSave} loading={saving} disabled={!valid}>
                        {bill ? 'Save' : 'Add reminder'}
                    </Button>
                </div>
            }
        >
            <div className="space-y-5">
                <Field label="Who is it to?" required>
                    {(props) => (
                        <Input
                            {...props}
                            value={billerName}
                            onChange={(e) => setBillerName(e.target.value)}
                            placeholder="Electricity, rent, phone…"
                            maxLength={80}
                        />
                    )}
                </Field>

                <Field label="Amount" hint="Optional — leave blank if it changes each time.">
                    {(props) => <AmountInput {...props} value={amount} onChange={setAmount} />}
                </Field>

                <Field label="Due date" required>
                    {(props) => (
                        <Input
                            {...props}
                            type="date"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                        />
                    )}
                </Field>

                <Field label="How often">
                    {(props) => (
                        <Select {...props} value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                            {Object.entries(BILL_FREQUENCY_LABEL).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </Select>
                    )}
                </Field>

                <Field label="Category">
                    {(props) => (
                        <Select {...props} value={category} onChange={(e) => setCategory(e.target.value)}>
                            {(categories.data ?? []).map((c) => (
                                <option key={c.name} value={c.name}>{c.name}</option>
                            ))}
                        </Select>
                    )}
                </Field>

                <Field label="Remind me" hint="How many days before it's due.">
                    {(props) => (
                        <Select
                            {...props}
                            value={reminderDaysBefore}
                            onChange={(e) => setReminderDaysBefore(e.target.value)}
                        >
                            <option value="0">On the day</option>
                            <option value="1">1 day before</option>
                            <option value="3">3 days before</option>
                            <option value="7">A week before</option>
                        </Select>
                    )}
                </Field>

                <Field label="Your reference with them" hint="Optional — an account or customer number, so you can find it.">
                    {(props) => (
                        <Input
                            {...props}
                            value={customerRef}
                            onChange={(e) => setCustomerRef(e.target.value)}
                            maxLength={80}
                        />
                    )}
                </Field>
            </div>
        </Sheet>
    );
};

export default BillEditorSheet;
