import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Target, Plus } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import GoalCard from '../../features/goals/GoalCard';
import GoalEditorSheet from '../../features/goals/GoalEditorSheet';
import ContributionSheet from '../../features/goals/ContributionSheet';
import useGoals from '../../features/goals/hooks/useGoals';
import { goalApi } from '../../services/api/endpoints/goalApi';
import { getErrorMessage } from '../../utils/errors';

const Goals = () => {
    const { data: goals, loading, error, retry, refresh } = useGoals('active');

    const [editorOpen, setEditorOpen] = useState(false);
    const [contributingGoal, setContributingGoal] = useState(null);
    const [saving, setSaving] = useState(false);

    const handleCreate = async (payload) => {
        setSaving(true);
        try {
            await goalApi.create(payload);
            setEditorOpen(false);
            refresh();
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not create this goal.'));
        } finally {
            setSaving(false);
        }
    };

    const handleContribute = async (payload) => {
        setSaving(true);
        try {
            const { data } = await goalApi.addContribution(contributingGoal._id, payload);
            if (data?.goal?.status === 'completed') {
                toast.success(`You reached your "${data.goal.name}" goal!`);
            }
            setContributingGoal(null);
            refresh();
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not save this contribution.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <PageHeader
                title="Goals"
                subtitle="Track progress toward what you're saving for."
                back={true}
                action={
                    <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => setEditorOpen(true)}>
                        New goal
                    </Button>
                }
            />

            {error ? (
                <ErrorState title="Goals unavailable" message={error} onRetry={retry} />
            ) : loading ? (
                <div className="space-y-3">
                    <Skeleton className="h-24 w-full" rounded="rounded-card" />
                    <Skeleton className="h-24 w-full" rounded="rounded-card" />
                </div>
            ) : goals?.length ? (
                <div className="space-y-3">
                    {goals.map((goal) => (
                        <GoalCard
                            key={goal._id}
                            goal={goal}
                            onContribute={setContributingGoal}
                        />
                    ))}
                </div>
            ) : (
                <EmptyState
                    variant="first-run"
                    icon={<Target size={20} />}
                    title="No goals yet"
                    description="Set a target and track your progress toward it — without moving any money out of your wallet."
                    action={
                        <Button variant="primary" onClick={() => setEditorOpen(true)}>
                            Create your first goal
                        </Button>
                    }
                />
            )}

            <GoalEditorSheet
                open={editorOpen}
                onClose={() => setEditorOpen(false)}
                onSave={handleCreate}
                saving={saving}
            />

            <ContributionSheet
                open={Boolean(contributingGoal)}
                onClose={() => setContributingGoal(null)}
                onSave={handleContribute}
                goal={contributingGoal}
                saving={saving}
            />
        </>
    );
};

export default Goals;
