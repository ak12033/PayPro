import React, { useEffect, useState } from 'react';
import Sheet from '../../components/ui/Sheet';
import Button from '../../components/ui/Button';
import Field, { AmountInput } from '../../components/ui/Field';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { toMinorUnits } from '../../constants/budget';

const ContributionSheet = ({ open, onClose, onSave, goal, saving }) => {
    const [amount, setAmount] = useState('');
    const [direction, setDirection] = useState('in');

    useEffect(() => {
        if (open) { setAmount(''); setDirection('in'); }
    }, [open]);

    const canSave = Number(amount) > 0;

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title={goal ? `Add to "${goal.name}"` : 'Add contribution'}
            description="Tracked, not locked — this does not move money out of your wallet."
            size="sm"
            footer={
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button variant="secondary" onClick={onClose} disabled={saving}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        loading={saving}
                        disabled={!canSave}
                        onClick={() => onSave({ amountMinor: toMinorUnits(amount), direction })}
                    >
                        Save
                    </Button>
                </div>
            }
        >
            <div className="space-y-4">
                <SegmentedControl
                    label="Direction"
                    value={direction}
                    onChange={setDirection}
                    options={[
                        { value: 'in', label: 'Add' },
                        { value: 'out', label: 'Withdraw (correction)' },
                    ]}
                />

                <Field label="Amount" required>
                    {(props) => <AmountInput {...props} value={amount} onChange={setAmount} />}
                </Field>
            </div>
        </Sheet>
    );
};

export default ContributionSheet;
