import React, { useState } from 'react';
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
 * Kept working, kept out of the navigation. The audit recommendation is to
 * remove this feature; it is here because removing a working backend endpoint
 * from under existing users is not a decision a redesign should make silently.
 *
 * The problem with it, stated plainly on the screen itself: this writes a row
 * into the same ledger that records real wallet movements, so the transaction
 * history and the wallet balance can disagree with no way for the user to tell
 * which is right. In a product whose entire value proposition is "you can trust
 * these numbers", a user-writable ledger row is a hole in the foundation.
 *
 * If it stays, the correct fix is a schema-level `source: 'manual' | 'ledger'`
 * flag so manual entries can be visually separated and excluded from balance
 * reconciliation — a backend change, and therefore out of scope here. The
 * disclosure below is the honest interim.
 */
const RecordTransaction = () => {
    const navigate = useNavigate();

    const [type, setType] = useState(TRANSACTION_TYPES.EXPENSE);
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState(TRANSACTION_CATEGORIES[0]);
    const [submitting, setSubmitting] = useState(false);
    const [errors, setErrors] = useState({});

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
                            {TRANSACTION_CATEGORIES.map((option) => (
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
