import React from 'react';
import { Sparkles, TrendingUp, PiggyBank, AlertTriangle, FileText, Calculator } from 'lucide-react';
import cn from '../../lib/cn';
import Card from '../../components/ui/Card';

/**
 * A single insight — either AI-generated (the on-demand FastAPI analysis) or
 * deterministic (plan.md §24.3, computed server-side with no model call).
 *
 * Two rules govern the AI case, and both are trust requirements rather than
 * aesthetic ones:
 *
 *   1. **Generated content is always labelled.** Every AI insight carries a
 *      visible "AI" marker and a violet tint reserved exclusively for machine
 *      output. A user must never be unable to tell whether a statement about
 *      their money came from their ledger or from a language model, because the
 *      two have very different reliability and the user should calibrate
 *      accordingly.
 *
 *   2. **AI never gets the last word on a warning.** A `warning` insight is
 *      styled as advisory, not as an alert, and never uses the same treatment
 *      as a real fraud block from the ledger. Dressing a model's guess as a
 *      security event teaches people to ignore security events.
 *
 * A deterministic insight inverts rule 1: it must NOT borrow the AI tint or
 * pill, because it is a computed fact, not a model's guess, and dressing it
 * up as AI output would make it *less* trustworthy, not more (plan.md §24.4).
 * `insight.source === 'deterministic'` is the only signal that distinguishes
 * the two shapes — everything else (`description`/`body`, `type`/`kind`) is
 * read leniently since the two producers (FastAPI's on-demand analysis vs
 * `insightsService`) don't share a schema.
 */
const TYPE_META = {
    trend: { icon: TrendingUp, label: 'Trend' },
    budget: { icon: PiggyBank, label: 'Budget' },
    warning: { icon: AlertTriangle, label: 'Worth a look' },
    summary: { icon: FileText, label: 'Summary' },
    CATEGORY_SPIKE: { icon: AlertTriangle, label: 'Spending spike' },
    BUDGET_PACE: { icon: PiggyBank, label: 'Budget pace' },
    LOW_SAVINGS_RATE: { icon: AlertTriangle, label: 'Savings rate' },
    UNUSUAL_LARGE_TXN: { icon: AlertTriangle, label: 'Unusual transaction' },
    INCOME_GAP: { icon: AlertTriangle, label: 'Income gap' },
    GOAL_BEHIND: { icon: PiggyBank, label: 'Goal pace' },
};

const InsightCard = ({ insight, compact = false }) => {
    const isAi = insight.source !== 'deterministic';
    const meta = TYPE_META[insight.type ?? insight.kind] ?? TYPE_META.summary;
    const Icon = isAi ? meta.icon : Calculator;
    const body = insight.description ?? insight.body;

    return (
        <Card
            padding={compact ? 'md' : 'lg'}
            className={isAi ? 'border-ai/20 bg-ai-soft/40' : undefined}
        >
            <div className="flex items-start gap-3">
                <span
                    aria-hidden="true"
                    className={cn(
                        'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full',
                        isAi ? 'bg-ai-soft text-ai' : 'bg-surface-sunken text-text-muted'
                    )}
                >
                    <Icon size={16} />
                </span>

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-text">{insight.title}</h3>
                        {isAi && (
                            <span className="inline-flex items-center gap-1 rounded-pill bg-ai-soft px-1.5 py-0.5 text-2xs font-medium text-ai">
                                <Sparkles size={10} aria-hidden="true" />
                                AI
                            </span>
                        )}
                    </div>

                    <p
                        className={cn(
                            'mt-1 text-sm leading-6 text-text-secondary',
                            compact && 'line-clamp-3'
                        )}
                    >
                        {body}
                    </p>

                    <p className="mt-2 text-2xs text-text-muted">
                        {isAi
                            ? `${meta.label} · Generated from your recent transactions. Not financial advice.`
                            : `${meta.label} · Computed from your transactions.`}
                    </p>
                </div>
            </div>
        </Card>
    );
};

export default InsightCard;
