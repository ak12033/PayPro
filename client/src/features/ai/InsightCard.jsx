import React from 'react';
import { Sparkles, TrendingUp, PiggyBank, AlertTriangle, FileText } from 'lucide-react';
import cn from '../../lib/cn';
import Card from '../../components/ui/Card';

/**
 * A single AI-generated insight.
 *
 * Two rules govern everything here, and both are trust requirements rather than
 * aesthetic ones:
 *
 *   1. **Generated content is always labelled.** Every insight carries a
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
 */
const TYPE_META = {
    trend: { icon: TrendingUp, label: 'Trend' },
    budget: { icon: PiggyBank, label: 'Budget' },
    warning: { icon: AlertTriangle, label: 'Worth a look' },
    summary: { icon: FileText, label: 'Summary' },
};

const InsightCard = ({ insight, compact = false }) => {
    const meta = TYPE_META[insight.type] ?? TYPE_META.summary;
    const Icon = meta.icon;

    return (
        <Card
            variant={compact ? 'plain' : 'plain'}
            padding={compact ? 'md' : 'lg'}
            className="border-ai/20 bg-ai-soft/40"
        >
            <div className="flex items-start gap-3">
                <span
                    aria-hidden="true"
                    className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ai-soft text-ai"
                >
                    <Icon size={16} />
                </span>

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-text">{insight.title}</h3>
                        <span className="inline-flex items-center gap-1 rounded-pill bg-ai-soft px-1.5 py-0.5 text-2xs font-medium text-ai">
                            <Sparkles size={10} aria-hidden="true" />
                            AI
                        </span>
                    </div>

                    <p
                        className={cn(
                            'mt-1 text-sm leading-6 text-text-secondary',
                            compact && 'line-clamp-3'
                        )}
                    >
                        {insight.description}
                    </p>

                    <p className="mt-2 text-2xs text-text-muted">
                        {meta.label} · Generated from your recent transactions. Not financial advice.
                    </p>
                </div>
            </div>
        </Card>
    );
};

export default InsightCard;
