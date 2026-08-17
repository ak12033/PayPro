import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, ShieldAlert, ChevronRight } from 'lucide-react';
import Card from '../../components/ui/Card';
import cn from '../../lib/cn';

/**
 * Security posture, as a checklist rather than a score out of 100.
 *
 * A number is the obvious design here and it is the wrong one. "Your security
 * score is 62" tells a user they should be worried without telling them what to
 * do, and — because the scale is invented — it implies a precision that does
 * not exist. Worse, a score that can never reach 100 (there is always one more
 * feature to ship) trains people to ignore it.
 *
 * A checklist of concrete, completable items answers the actual question:
 * *what, specifically, should I turn on?* The headline count is derived from
 * the list rather than the other way round.
 *
 * Items the product cannot yet deliver — passkeys, biometrics — are shown as
 * "coming soon" rather than omitted, because a security page that silently
 * lacks passkeys reads as a product that does not support them. Being explicit
 * is more trustworthy than being quiet.
 */
const SecurityScore = ({ checks }) => {
    const actionable = checks.filter((check) => !check.comingSoon);
    const done = actionable.filter((check) => check.done).length;
    const total = actionable.length;
    const allDone = done === total;

    return (
        <Card variant="raised">
            <div className="flex items-start gap-3">
                <span
                    aria-hidden="true"
                    className={cn(
                        'grid h-11 w-11 shrink-0 place-items-center rounded-full',
                        allDone ? 'bg-positive-soft text-positive' : 'bg-warning-soft text-warning'
                    )}
                >
                    {allDone ? <ShieldCheck size={22} /> : <ShieldAlert size={22} />}
                </span>

                <div className="min-w-0 flex-1">
                    <h2 className="text-base font-semibold text-text">
                        {allDone ? 'Your account is well protected' : 'Strengthen your account'}
                    </h2>
                    <p className="mt-0.5 text-sm text-text-muted">
                        {done} of {total} protections enabled
                    </p>

                    {/*
                     * One continuous bar, not one segment per check.
                     *
                     * Segments were the first attempt and they are actively
                     * misleading here: the bar sits directly above the
                     * checklist, so N segments beside N rows reads as
                     * positional — "the first two are done" — when the fill is
                     * really just a count. With two of three enabled and the
                     * *middle* one missing, the segmented version pointed at
                     * the wrong row.
                     *
                     * The count is stated in words above regardless, so the
                     * bar is reinforcement rather than the only signal.
                     */}
                    <div
                        role="progressbar"
                        aria-valuenow={done}
                        aria-valuemin={0}
                        aria-valuemax={total}
                        aria-label="Security protections enabled"
                        className="mt-3 h-1.5 overflow-hidden rounded-pill bg-border"
                    >
                        <div
                            className="h-full rounded-pill bg-positive transition-[width] duration-[--duration-slow] ease-[--ease-out]"
                            style={{ width: `${total ? (done / total) * 100 : 0}%` }}
                        />
                    </div>
                </div>
            </div>

            <ul className="mt-4 divide-y divide-border border-t border-border">
                {checks.map((check) => (
                    <li key={check.id}>
                        <CheckRow check={check} />
                    </li>
                ))}
            </ul>
        </Card>
    );
};

const CheckRow = ({ check }) => {
    const content = (
        <>
            <span
                aria-hidden="true"
                className={cn(
                    'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] font-bold',
                    check.comingSoon
                        ? 'border-border text-text-muted'
                        : check.done
                          ? 'border-positive bg-positive text-white'
                          : 'border-warning text-warning'
                )}
            >
                {check.done ? '✓' : check.comingSoon ? '·' : '!'}
            </span>

            <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-text">{check.label}</span>
                    {check.comingSoon && (
                        <span className="rounded-pill bg-surface-sunken px-1.5 py-0.5 text-2xs text-text-muted">
                            Coming soon
                        </span>
                    )}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-text-muted">
                    {check.description}
                </span>
            </span>

            {check.to && !check.done && (
                <ChevronRight size={16} className="mt-0.5 shrink-0 text-text-muted" aria-hidden="true" />
            )}
        </>
    );

    const classes = 'flex w-full items-start gap-3 py-3 text-left';

    // Only unfinished, actionable items are links — a completed check with a
    // chevron invites a click that does nothing useful.
    if (check.to && !check.done && !check.comingSoon) {
        return (
            <Link to={check.to} className={cn(classes, 'rounded-control hover:bg-surface-hover')}>
                {content}
            </Link>
        );
    }

    return <div className={classes}>{content}</div>;
};

export default SecurityScore;
