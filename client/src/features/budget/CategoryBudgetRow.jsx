import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import ProgressBar from '../../components/ui/ProgressBar';
import Amount from '../../components/ui/Amount';
import { BUDGET_STATUS_LABEL, toRupees } from '../../constants/budget';

/**
 * One category's spend vs its limit. Over-budget is conveyed by icon and
 * text as well as colour (plan.md §13.6's accessibility rule) — colour alone
 * never carries the signal.
 */
const CategoryBudgetRow = ({ category, spentMinor, limitMinor, percent, status }) => (
    <li className="py-3">
        <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-text">
                {status === 'over' && <AlertTriangle size={14} className="shrink-0 text-negative" aria-hidden="true" />}
                {status === 'ok' && percent >= 0 && (
                    <CheckCircle2 size={14} className="shrink-0 text-positive" aria-hidden="true" />
                )}
                <span className="truncate">{category}</span>
            </span>
            <span className="shrink-0 text-xs text-text-muted">
                <Amount minor={spentMinor} size="sm" showFraction={false} /> / ₹{toRupees(limitMinor).toFixed(0)}
            </span>
        </div>

        <ProgressBar
            className="mt-2"
            value={spentMinor}
            max={limitMinor}
            label={`${category}: ${(spentMinor / 100).toFixed(2)} of ${(limitMinor / 100).toFixed(2)} rupees spent, ${BUDGET_STATUS_LABEL[status]}`}
        />

        <p className="mt-1 text-2xs text-text-muted">
            {BUDGET_STATUS_LABEL[status]} · {percent}%
        </p>
    </li>
);

export default CategoryBudgetRow;
