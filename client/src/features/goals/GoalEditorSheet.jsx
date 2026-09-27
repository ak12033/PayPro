import React, { useEffect, useState } from 'react';
import Sheet from '../../components/ui/Sheet';
import Button from '../../components/ui/Button';
import Field, { AmountInput, Input, Select } from '../../components/ui/Field';
import { toMinorUnits, toRupees } from '../../constants/budget';

const GOAL_TYPES = [
    { value: 'emergency', label: 'Emergency fund' },
    { value: 'vacation', label: 'Vacation' },
    { value: 'vehicle', label: 'Vehicle' },
    { value: 'education', label: 'Education' },
    { value: 'home', label: 'Home' },
    { value: 'custom', label: 'Custom' },
];

const GoalEditorSheet = ({ open, onClose, onSave, goal, saving }) => {
    const [name, setName] = useState('');
    const [type, setType] = useState('custom');
    const [target, setTarget] = useState('');
    const [targetDate, setTargetDate] = useState('');

    useEffect(() => {
        if (!open) return;
        setName(goal?.name ?? '');
        setType(goal?.type ?? 'custom');
        setTarget(goal?.targetMinor != null ? String(toRupees(goal.targetMinor)) : '');
        setTargetDate(goal?.targetDate ? new Date(goal.targetDate).toISOString().slice(0, 10) : '');
    }, [open, goal]);

    const canSave = name.trim() && Number(target) > 0 && targetDate;

    const handleSave = () => {
        onSave({
            name: name.trim(),
            type,
            targetMinor: toMinorUnits(target),
            targetDate,
        });
    };

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title={goal ? 'Edit goal' : 'New goal'}
            size="md"
            footer={
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button variant="secondary" onClick={onClose} disabled={saving}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={handleSave} loading={saving} disabled={!canSave}>
                        Save goal
                    </Button>
                </div>
            }
        >
            <div className="space-y-4">
                <Field label="Goal name" required>
                    {(props) => (
                        <Input {...props} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Emergency fund" maxLength={60} />
                    )}
                </Field>

                <Field label="Type">
                    {(props) => (
                        <Select {...props} value={type} onChange={(e) => setType(e.target.value)}>
                            {GOAL_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </Select>
                    )}
                </Field>

                <Field label="Target amount" required>
                    {(props) => <AmountInput {...props} value={target} onChange={setTarget} />}
                </Field>

                <Field label="Target date" required>
                    {(props) => (
                        <input
                            {...props}
                            type="date"
                            value={targetDate}
                            onChange={(e) => setTargetDate(e.target.value)}
                            min={new Date().toISOString().slice(0, 10)}
                            className="h-11 w-full rounded-control border border-border bg-surface px-3 text-sm text-text focus:border-accent"
                        />
                    )}
                </Field>

                <p className="text-xs text-text-muted">
                    Tracked, not locked — a goal is a tracker, not a real reservation of your wallet balance.
                </p>
            </div>
        </Sheet>
    );
};

export default GoalEditorSheet;
