import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Info } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import SegmentedControl from '../components/ui/SegmentedControl';
import { AmountInput, Field, Input, Select } from '../components/ui/Field';
import { transactionApi } from '../services/api/endpoints/transactionApi';
import { getErrorMessage } from '../utils/errors';
import { ROUTES } from '../constants/routes';
import {
    TRANSACTION_CATEGORIES,
    TRANSACTION_TYPES,
} from '../constants/transactions';

/**
 * Manual transaction entry.
 *
 * A note in the user's own history describing spending that happened outside
 * PayPro — never a movement of money. `ledgerService.applyManualTransaction`
 * writes the row with `settlement: 'none'`, which is what every balance and
 * reconciliation query filters on to exclude it: the wallet balance and this
 * form can no longer disagree, because this form cannot touch the balance at
 * all. (It used to — `type: "income"` credited real, spendable balance for
 * money that never moved. That defect is what `settlement: 'none'` closes.)
 * The disclosure below states the current, accurate behaviour.
 */
const RecordTransaction = () => {
    const navigate = useNavigate();

    const [type, setType] = useState(TRANSACTION_TYPES.EXPENSE);
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState(TRANSACTION_CATEGORIES[0]);
    const [categories, setCategories] = useState(TRANSACTION_CATEGORIES);
    const [submitting, setSubmitting] = useState(false);
    const [errors, setErrors] = useState({});

    // The static fallback renders immediately; the canonical list (shared with
    // the AI categoriser) replaces it once it arrives, so a slow network never
    // blocks the form.
    useEffect(() => {
        transactionApi.getCategories()
            .then(({ data }) => {
                const names = (data.categories ?? []).map((c) => c.name);
                if (names.length) setCategories(names);
            })
            .catch(() => {});
    }, []);

    const numericAmount = Number(amount);

    const submit = async (event) => {
        event.preventDefault();
        if (submitting) return;

        const nextErrors = {};
        if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
            nextErrors.amount = 'Enter an amount greater than zero.';
        }
        if (!description.trim()) {
            nextErrors.description = 'Add a short description so you recognise this later.';
        }

        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) return;

        setSubmitting(true);
        try {
            await transactionApi.add({
                amount: numericAmount,
                description: description.trim(),
                category,
                type,
            });

            toast.success('Transaction recorded');
            navigate(ROUTES.ACTIVITY);
        } catch (caught) {
            toast.error(getErrorMessage(caught, 'Could not record this transaction.'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="mx-auto max-w-md">
            <PageHeader
                title="Record a transaction"
                subtitle="Log spending that happened outside PayPro."
                back={ROUTES.MONEY}
            />

            {/* Said up front, not buried. The user should understand what this
                does and does not do before they fill the form in. */}
            <Card variant="sunken" padding="md" className="mb-4">
                <div className="flex gap-2.5">
                    <Info size={16} className="mt-0.5 shrink-0 text-text-muted" aria-hidden="true" />
                    <p className="text-xs leading-5 text-text-secondary">
                        This adds a note to your history for your own reference. It does not move
                        money and does not change your wallet balance.
                    </p>
                </div>
            </Card>

            <form onSubmit={submit} className="space-y-4" noValidate>
                <SegmentedControl
                    label="Transaction direction"
                    options={[
                        { value: TRANSACTION_TYPES.EXPENSE, label: 'Money out' },
                        { value: TRANSACTION_TYPES.INCOME, label: 'Money in' },
                    ]}
                    value={type}
                    onChange={setType}
                />

                <Field label="Amount" required error={errors.amount}>
                    {(props) => <AmountInput value={amount} onChange={setAmount} {...props} />}
                </Field>

                <Field label="Description" required error={errors.description}>
                    {(props) => (
                        <Input
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            placeholder="Coffee with Sam"
                            maxLength={120}
                            {...props}
                        />
                    )}
                </Field>

                <Field label="Category">
                    {(props) => (
                        <Select
                            value={category}
                            onChange={(event) => setCategory(event.target.value)}
                            {...props}
                        >
                            {categories.map((option) => (
                                <option key={option} value={option}>
                                    {option}
                                </option>
                            ))}
                        </Select>
                    )}
                </Field>

                <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting}>
                    Record transaction
                </Button>
            </form>
        </div>
    );
};

export default RecordTransaction;
