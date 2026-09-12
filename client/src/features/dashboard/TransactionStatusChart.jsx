import React from 'react';
import { CheckCircle2, Clock, XCircle, RotateCcw, Receipt } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import { formatNumber } from '../../utils/formatters';

/**
 * Chart 3 — transaction analytics.
 *
 * What fraction of payments actually settle, are still pending, failed, or
 * were refunded — a single 100%-stacked bar for part-to-whole composition,
 * with each segment carrying status colour, an icon and a label (never
 * colour alone, since "failed" is exactly the state a colourblind user must
 * not miss).
 *
 * The segments deliberately do NOT take the teal visualization ramp. These
 * four are not categories, they are *states*, and their colours are the
 * product's status vocabulary: amber warns, rose fails, green settled. A bar
 * where "Failed" is rendered as a shade of teal would be the one place in the
 * app where the colour of a failure carries no warning, and lightness is not
 * a substitute for that. "Refunded" already sits on `--color-info`, which is
 * the brand cyan — so the one status with no inherent good/bad reading is
 * the one that does land in the palette.
 */
const SEGMENTS = [
    { key: 'captured', label: 'Settled', icon: CheckCircle2, tone: 'positive' },
    { key: 'pending', label: 'Pending', icon: Clock, tone: 'warning' },
    { key: 'failed', label: 'Failed', icon: XCircle, tone: 'negative' },
    { key: 'refunded', label: 'Refunded', icon: RotateCcw, tone: 'info' },
];

const TONE_BAR = {
    positive: 'var(--color-positive)',
    warning: 'var(--color-warning)',
    negative: 'var(--color-negative)',
    info: 'var(--color-info)',
};

const TONE_TEXT = {
    positive: 'text-positive',
    warning: 'text-warning',
    negative: 'text-negative',
    info: 'text-info',
};

const TONE_ICON_BG = {
    positive: 'bg-positive-soft',
    warning: 'bg-warning-soft',
    negative: 'bg-danger-soft',
    info: 'bg-info-soft',
};

const TransactionStatusChart = ({ paymentsStatus, loading, error, onRetry }) => {
    if (error) {
        return (
            <Card>
                <ErrorState title="Transaction analytics unavailable" message={error} onRetry={onRetry} />
            </Card>
        );
    }

    const summary = paymentsStatus?.summary;
    const total = summary
        ? summary.captured + summary.pending + summary.failed + summary.refunded
        : 0;

    return (
        <Card>
            <CardHeader title="Transaction analytics" description="How this period's payments settled" />

            <div className="mt-4">
                {loading ? (
                    <div className="space-y-3">
                        <Skeleton className="h-3 w-full" rounded="rounded-pill" />
                        <Skeleton className="h-16 w-full" />
                    </div>
                ) : total === 0 ? (
                    <EmptyState
                        variant="first-run"
                        icon={<Receipt size={20} />}
                        title="No payments yet"
                        description="Once you add money to your wallet, its settlement status will show up here."
                    />
                ) : (
                    <>
                        <div className="flex h-3 w-full overflow-hidden rounded-pill" role="img" aria-label="Payment status breakdown">
                            {SEGMENTS.map((segment) => {
                                const count = summary[segment.key] ?? 0;
                                const width = (count / total) * 100;
                                if (width <= 0) return null;
                                return (
                                    <div
                                        key={segment.key}
                                        style={{ width: `${width}%`, backgroundColor: TONE_BAR[segment.tone] }}
                                        className="h-full first:rounded-l-pill last:rounded-r-pill"
                                    />
                                );
                            })}
                        </div>

                        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {SEGMENTS.map((segment) => {
                                const count = summary[segment.key] ?? 0;
                                const percent = total ? ((count / total) * 100).toFixed(0) : '0';
                                const Icon = segment.icon;

                                return (
                                    <div key={segment.key} className="flex items-start gap-2">
                                        <span
                                            aria-hidden="true"
                                            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${TONE_ICON_BG[segment.tone]} ${TONE_TEXT[segment.tone]}`}
                                        >
                                            <Icon size={14} />
                                        </span>
                                        <div className="min-w-0">
                                            <dt className="text-xs text-text-muted">{segment.label}</dt>
                                            <dd className="text-sm font-semibold tabular-nums text-text">
                                                {formatNumber(count)}
                                                <span className="ml-1 text-xs font-normal text-text-muted">{percent}%</span>
                                            </dd>
                                        </div>
                                    </div>
                                );
                            })}
                        </dl>
                    </>
                )}
            </div>
        </Card>
    );
};

export default TransactionStatusChart;
