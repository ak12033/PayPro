import React from 'react';
import { PlusCircle } from 'lucide-react';
import Card from '../../components/ui/Card';
import Amount from '../../components/ui/Amount';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import GoalProgressRing from './GoalProgressRing';

const GoalCard = ({ goal, onContribute, onOpen }) => {
    const overdue = new Date(goal.targetDate) < new Date() && goal.status === 'active';

    return (
        <Card
            className={goal.status === 'completed' ? 'animate-pop' : undefined}
            onClick={onOpen}
        >
            <div className="flex items-start gap-3">
                <GoalProgressRing
                    value={goal.currentMinor}
                    max={goal.targetMinor}
                    label={`${goal.name}: ${(goal.currentMinor / 100).toFixed(2)} of ${(goal.targetMinor / 100).toFixed(2)} rupees`}
                />

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-text">{goal.name}</h3>
                        {goal.status === 'completed' && <Badge tone="positive" size="sm">Completed</Badge>}
                        {overdue && <Badge tone="warning" size="sm">Overdue</Badge>}
                    </div>

                    <p className="mt-1 text-sm text-text-muted">
                        <Amount minor={goal.currentMinor} size="sm" showFraction={false} /> of{' '}
                        <Amount minor={goal.targetMinor} size="sm" showFraction={false} tone="muted" />
                    </p>

                    <p className="mt-1 text-2xs text-text-muted">
                        Tracked, not locked — this money is still in your wallet.
                    </p>

                    {goal.status === 'active' && onContribute && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="mt-2"
                            icon={<PlusCircle size={14} />}
                            onClick={(e) => { e.stopPropagation(); onContribute(goal); }}
                        >
                            Add contribution
                        </Button>
                    )}
                </div>
            </div>
        </Card>
    );
};

export default GoalCard;
