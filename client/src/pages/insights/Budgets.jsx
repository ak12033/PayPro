import React, { useState } from 'react';
import toast from 'react-hot-toast';
import PageHeader, { SectionHeading } from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import List from '../../components/ui/List';
import Amount from '../../components/ui/Amount';
import { ConfirmSheet } from '../../components/ui/Sheet';
import EmptyState from '../../components/feedback/EmptyState';
import BudgetSummaryCard from '../../features/budget/BudgetSummaryCard';
import CategoryBudgetRow from '../../features/budget/CategoryBudgetRow';
import BudgetEditorSheet from '../../features/budget/BudgetEditorSheet';
import useBudget from '../../features/budget/hooks/useBudget';
import useQuery from '../../hooks/useQuery';
import { budgetApi } from '../../services/api/endpoints/budgetApi';
import { toRupees } from '../../constants/budget';
import { getErrorMessage } from '../../utils/errors';

/**
 * Budgets. Reached from Insights, not a fifth nav tab (plan.md §13.6 — the
 * tab bar stays at four items).
 */
const Budgets = () => {
    const { data, loading, error, retry, refresh } = useBudget();
    const history = useQuery(async () => (await budgetApi.getHistory()).data?.entries ?? [], { key: 'budget:history' });

    const [editorOpen, setEditorOpen] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [saving, setSaving] = useState(false);

    const handleSave = async (payload) => {
        setSaving(true);
        try {
            if (data?.budget) {
                await budgetApi.update(data.budget.id, payload);
            } else {
                await budgetApi.create(payload);
            }
            setEditorOpen(false);
            refresh();
            history.refresh();
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not save this budget.'));
        } finally {
            setSaving(false);
        }
    };

    const handleArchive = async () => {
        try {
            await budgetApi.archive(data.budget.id);
            toast.success('Budget archived. Your transactions are not affected.');
            setConfirmDelete(false);
            refresh();
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not archive this budget.'));
        }
    };

    return (
        <>
            <PageHeader
                title="Budgets"
                subtitle="Set monthly limits and see how your spending is tracking."
                back={true}
                action={
                    <Button variant="secondary" size="sm" onClick={() => setEditorOpen(true)}>
                        {data?.budget ? 'Edit' : 'Create'}
                    </Button>
                }
            />

            <BudgetSummaryCard data={data} loading={loading} error={error} onRetry={retry} onCreate={() => setEditorOpen(true)} />

            {data?.spend?.byCategory?.length > 0 && (
                <section className="mt-6" aria-labelledby="category-budgets-heading">
                    <SectionHeading id="category-budgets-heading" title="By category" />
                    <Card>
                        <ul className="divide-y divide-border">
                            {data.spend.byCategory.map((c) => (
                                <CategoryBudgetRow key={c.category} {...c} />
                            ))}
                        </ul>
                    </Card>
                </section>
            )}

            {data?.budget && (
                <div className="mt-4 text-right">
                    <button
                        type="button"
                        onClick={() => setConfirmDelete(true)}
                        className="text-xs font-medium text-text-muted hover:text-negative"
                    >
                        Archive this budget
                    </button>
                </div>
            )}

            <section className="mt-6" aria-labelledby="budget-history-heading">
                <SectionHeading id="budget-history-heading" title="Past periods" />
                <Card padding="none">
                    {history.data?.length ? (
                        <List>
                            {history.data.map((entry) => (
                                <li key={entry.period} className="flex items-center justify-between gap-3 px-4 py-3">
                                    <span className="text-sm text-text">{entry.period}</span>
                                    <span className="text-xs text-text-muted">
                                        <Amount minor={entry.totalSpentMinor} size="sm" showFraction={false} />
                                        {entry.totalLimitMinor != null && ` of ₹${toRupees(entry.totalLimitMinor).toFixed(0)}`}
                                    </span>
                                </li>
                            ))}
                        </List>
                    ) : (
                        <EmptyState
                            variant="first-run"
                            title="No past periods yet"
                            description="Once a month ends, it will show up here."
                        />
                    )}
                </Card>
            </section>

            <BudgetEditorSheet
                open={editorOpen}
                onClose={() => setEditorOpen(false)}
                onSave={handleSave}
                budget={data?.budget}
                saving={saving}
            />

            <ConfirmSheet
                open={confirmDelete}
                onClose={() => setConfirmDelete(false)}
                onConfirm={handleArchive}
                title="Archive this budget?"
                description="Your transactions are not affected — this only removes the limit."
                confirmLabel="Archive"
                variant="danger"
            />
        </>
    );
};

export default Budgets;
