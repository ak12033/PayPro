import React, { useState } from 'react';
import { Activity, ChevronDown, Info } from 'lucide-react';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import ScoreMeter from '../../components/ui/ScoreMeter';
import Skeleton from '../../components/ui/Skeleton';
import cn from '../../lib/cn';

/**
 * Financial health (plan.md §25).
 *
 * Two things this screen refuses to do, both of them requirements rather than
 * taste:
 *
 *   1. **It never shows a number it does not have.** A component the server
 *      marked `insufficient_data` renders as "not enough data yet" plus what
 *      would unlock it — not as a zero, and not hidden. Hiding it would be
 *      quieter and worse: a score built from two components out of five looks
 *      identical to one built from all five unless the page says otherwise,
 *      which is what `coverage` is for.
 *
 *   2. **The disclaimer is adjacent to the score, not in a tooltip** (§25.2).
 *      It comes from the API response, so there is no client-side constant
 *      anyone can forget to render.
 */

const BAND_LABEL = {
    excellent: 'Excellent',
    good: 'Good',
    fair: 'Fair',
    needs_attention: 'Needs attention',
};

const BAND_TONE = {
    excellent: 'positive',
    good: 'positive',
    fair: 'warning',
    needs_attention: 'negative',
};

const FinancialHealthCard = ({ health, loading }) => {
    const [expanded, setExpanded] = useState(false);

    if (loading) {
        return (
            <Card variant="raised">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="mt-3 h-1.5 w-full" />
                <Skeleton className="mt-4 h-4 w-56" />
            </Card>
        );
    }

    if (!health) return null;

    const { score, band, coverage, components = [], recommendations = [], disclaimer } = health;
    const unscored = score === null || score === undefined;

    return (
        <Card variant="raised">
            <div className="flex items-start gap-3">
                <span
                    aria-hidden="true"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"
                >
                    <Activity size={22} />
                </span>

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold text-text">Financial health</h2>
                        {!unscored && (
                            <Badge tone={BAND_TONE[band]} size="sm">{BAND_LABEL[band]}</Badge>
                        )}
                    </div>

                    <p className="mt-0.5 text-sm text-text-muted">
                        {unscored
                            ? 'Not enough data yet to score this'
                            : <><span className="font-semibold text-text">{score}</span> out of 100</>}
                    </p>

                    <ScoreMeter
                        value={unscored ? null : score}
                        label="Financial health score"
                        className="mt-3"
                        caption={
                            unscored
                                ? 'Set a budget, add a goal, or record a couple of months of income to unlock this.'
                                // Stating coverage is what stops a two-component
                                // score reading as a five-component one.
                                : `Based on ${coverage}% of the full picture — the rest needs more data.`
                        }
                    />
                </div>
            </div>

            {/* §25.2: adjacent to the score, not behind a tooltip. */}
            <p className="mt-4 flex items-start gap-2 rounded-control bg-surface-sunken p-3 text-xs leading-5 text-text-muted">
                <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>{disclaimer}</span>
            </p>

            {recommendations.length > 0 && (
                <ul className="mt-4 space-y-2">
                    {recommendations.map((rec) => (
                        <li key={rec.key} className="rounded-control border border-border p-3">
                            <p className="text-sm font-medium text-text">{rec.label}</p>
                            <p className="mt-0.5 text-xs leading-5 text-text-muted">{rec.detail}</p>
                        </li>
                    ))}
                </ul>
            )}

            <button
                type="button"
                onClick={() => setExpanded((open) => !open)}
                aria-expanded={expanded}
                className="mt-4 flex w-full items-center justify-between rounded-control py-2 text-left text-sm font-medium text-text hover:bg-surface-hover"
            >
                How this is worked out
                <ChevronDown
                    size={16}
                    aria-hidden="true"
                    className={cn('transition-transform duration-(--duration-fast)', expanded && 'rotate-180')}
                />
            </button>

            {expanded && (
                <ul className="divide-y divide-border border-t border-border">
                    {components.map((component) => (
                        <li key={component.key} className="py-3">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <span className="text-sm font-medium text-text">{component.label}</span>
                                <span className="text-xs text-text-muted">
                                    {component.status === 'scored'
                                        ? `${Math.round(component.score)}/100 · ${component.weight}% of the score`
                                        : 'Not enough data yet'}
                                </span>
                            </div>
                            {component.status === 'scored' && (
                                <ScoreMeter
                                    value={component.score}
                                    label={`${component.label} score`}
                                    className="mt-2"
                                />
                            )}
                            <p className="mt-1.5 text-xs leading-5 text-text-muted">{component.explanation}</p>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
};

export default FinancialHealthCard;
