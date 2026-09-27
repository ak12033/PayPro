import React, { useEffect, useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import Sheet from '../../components/ui/Sheet';
import Button from '../../components/ui/Button';
import Field, { AmountInput, Select } from '../../components/ui/Field';
import Switch from '../../components/ui/Switch';
import { toMinorUnits, toRupees } from '../../constants/budget';
import useQuery from '../../hooks/useQuery';
import { transactionApi } from '../../services/api/endpoints/transactionApi';

/**
 * Create or edit the current period's budget. `budget` (when present) is the
 * `budget` slice of `GET /budgets`'s response — editing only ever targets the
 * period already on screen, matching plan.md §13.3's one-budget-per-period model.
 */
const BudgetEditorSheet = ({ open, onClose, onSave, budget, saving }) => {
    const categories = useQuery(async () => (await transactionApi.getCategories()).data?.categories ?? [], {
        enabled: open,
    });

    const [totalLimit, setTotalLimit] = useState('');
    const [rollover, setRollover] = useState(false);
    const [recurring, setRecurring] = useState(false);
    const [rows, setRows] = useState([]);

    useEffect(() => {
        if (!open) return;
        setTotalLimit(budget?.totalLimitMinor != null ? String(toRupees(budget.totalLimitMinor)) : '');
        setRollover(Boolean(budget?.rollover));
        setRecurring(Boolean(budget?.recurring));
        setRows(
            (budget?.categories ?? []).map((c) => ({
                category: c.category,
                limit: String(toRupees(c.limitMinor)),
            }))
        );
    }, [open, budget]);

    const addRow = () => setRows((r) => [...r, { category: '', limit: '' }]);
    const removeRow = (index) => setRows((r) => r.filter((_, i) => i !== index));
    const updateRow = (index, patch) =>
        setRows((r) => r.map((row, i) => (i === index ? { ...row, ...patch } : row)));

    const handleSave = () => {
        const payload = {
            totalLimitMinor: totalLimit ? toMinorUnits(totalLimit) : undefined,
            rollover,
            recurring,
            categories: rows
                .filter((r) => r.category && r.limit)
                .map((r) => ({ category: r.category, limitMinor: toMinorUnits(r.limit) })),
        };
        onSave(payload);
    };

    const categoryOptions = categories.data ?? [];

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title={budget ? 'Edit budget' : 'Create a budget'}
            description="This applies to the current month."
            size="md"
            footer={
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button variant="secondary" onClick={onClose} disabled={saving}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={handleSave} loading={saving}>
                        Save budget
                    </Button>
                </div>
            }
        >
            <div className="space-y-5">
                <Field label="Overall monthly limit" hint="Optional — leave blank to only track by category.">
                    {(props) => (
                        <AmountInput {...props} value={totalLimit} onChange={setTotalLimit} />
                    )}
                </Field>

                <div>
                    <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-medium text-text">Category limits</p>
                        <Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={addRow}>
                            Add category
                        </Button>
                    </div>

                    <div className="space-y-2">
                        {rows.map((row, index) => (
                            <div key={index} className="flex items-center gap-2">
                                <Select
                                    value={row.category}
                                    onChange={(e) => updateRow(index, { category: e.target.value })}
                                    className="flex-1"
                                >
                                    <option value="">Select category</option>
                                    {categoryOptions.map((c) => (
                                        <option key={c.name} value={c.name}>{c.name}</option>
                                    ))}
                                </Select>
                                <div className="w-28 shrink-0">
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        placeholder="₹"
                                        value={row.limit}
                                        onChange={(e) => {
                                            const next = e.target.value;
                                            if (next === '' || /^\d*\.?\d{0,2}$/.test(next)) {
                                                updateRow(index, { limit: next });
                                            }
                                        }}
                                        className="h-11 w-full rounded-control border border-border bg-surface px-3 text-sm text-text focus:border-accent"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => removeRow(index)}
                                    className="grid h-9 w-9 shrink-0 place-items-center rounded-control text-text-muted hover:bg-surface-hover hover:text-negative"
                                    aria-label={`Remove ${row.category || 'category'}`}
                                >
                                    <Trash2 size={15} />
                                </button>
                            </div>
                        ))}
                        {rows.length === 0 && (
                            <p className="text-xs text-text-muted">No category limits yet.</p>
                        )}
                    </div>
                </div>

                <div className="divide-y divide-border border-t border-border">
                    <Switch
                        label="Roll over unspent budget"
                        description="Carry any unspent amount into next month's limit, capped at 2x."
                        checked={rollover}
                        onChange={setRollover}
                    />
                    <Switch
                        label="Repeat every month"
                        description="Automatically create next month's budget from this one."
                        checked={recurring}
                        onChange={setRecurring}
                    />
                </div>
            </div>
        </Sheet>
    );
};

export default BudgetEditorSheet;
