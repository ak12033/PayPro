import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ShieldAlert, LifeBuoy, Webhook } from 'lucide-react';
import PageHeader, { SectionHeading } from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Amount from '../../components/ui/Amount';
import Skeleton from '../../components/ui/Skeleton';
import IconBadge from '../../components/ui/IconBadge';
import ErrorState from '../../components/feedback/ErrorState';
import useQuery from '../../hooks/useQuery';
import { useAuth } from '../../context/AuthContext';
import { adminApi } from '../../services/api/endpoints/adminApi';
import { can } from '../../constants/admin';
import { ROUTES } from '../../constants/routes';
import { formatNumber } from '../../utils/formatters';

/**
 * Console landing (plan.md §28.2 "Dashboard").
 *
 * Leads with the work waiting on a person — held transfers and open tickets —
 * before platform counters, because those are the numbers that mean a
 * customer is stuck right now. Each queue count is fetched only for a role
 * that can act on it; a support agent never sees a risk count they cannot
 * open.
 */
const AdminOverview = () => {
    const { user } = useAuth();
    const role = user?.role;

    const metrics = useQuery(async () => (await adminApi.getMetrics()).data);
    const risk = useQuery(
        async () => (await adminApi.listRiskCases({ status: 'open' })).data,
        { enabled: can(role, 'reviewRisk') }
    );
    const support = useQuery(
        async () => (await adminApi.listTickets({ status: 'open' })).data,
        { enabled: can(role, 'workSupport') }
    );

    const m = metrics.data;

    return (
        <>
            <PageHeader title="Overview" subtitle="What needs a person, then how the platform is doing today." />

            <section className="mb-6" aria-labelledby="queues-heading">
                <SectionHeading id="queues-heading" title="Waiting on staff" />
                <div className="grid gap-3 sm:grid-cols-3">
                    {can(role, 'reviewRisk') && (
                        <QueueTile
                            to={ROUTES.ADMIN_RISK}
                            icon={<ShieldAlert size={17} />}
                            tone="warning"
                            label="Held & blocked transfers"
                            value={risk.data?.total}
                            loading={risk.loading}
                            error={risk.error}
                            hint="Holds auto-release after 24h if nobody reviews them."
                        />
                    )}
                    {can(role, 'workSupport') && (
                        <QueueTile
                            to={ROUTES.ADMIN_SUPPORT}
                            icon={<LifeBuoy size={17} />}
                            tone="accent"
                            label="Open tickets"
                            value={support.data?.total}
                            loading={support.loading}
                            error={support.error}
                            hint="Fraud reports arrive marked urgent."
                        />
                    )}
                    {can(role, 'viewWebhooks') && (
                        <QueueTile
                            to={ROUTES.ADMIN_WEBHOOKS}
                            icon={<Webhook size={17} />}
                            tone="neutral"
                            label="Unprocessed webhooks"
                            value={m?.pendingWebhooks}
                            loading={metrics.loading}
                            error={metrics.error}
                            hint="Deliveries received but not yet settled."
                        />
                    )}
                </div>
            </section>

            <section aria-labelledby="platform-heading">
                <SectionHeading id="platform-heading" title="Platform today" />
                {metrics.error ? (
                    <Card>
                        <ErrorState title="Metrics unavailable" message={metrics.error} onRetry={metrics.retry} reassurance={null} />
                    </Card>
                ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <StatTile label="Users" loading={metrics.loading}>
                            {m && formatNumber(m.users.total)}
                        </StatTile>
                        <StatTile label="Suspended" loading={metrics.loading}>
                            {m && formatNumber(m.users.suspended)}
                        </StatTile>
                        <StatTile label="Settled in today" loading={metrics.loading}>
                            {m && <Amount value={m.volumeToday.credits} size="md" />}
                        </StatTile>
                        <StatTile label="Settled out today" loading={metrics.loading}>
                            {m && <Amount value={m.volumeToday.debits} size="md" />}
                        </StatTile>
                        <StatTile label="Top-up success rate" loading={metrics.loading}>
                            {m && (m.payments.successRate === null ? '—' : `${m.payments.successRate}%`)}
                        </StatTile>
                        <StatTile label="Top-up orders" loading={metrics.loading}>
                            {m && `${formatNumber(m.payments.captured)} / ${formatNumber(m.payments.total)} captured`}
                        </StatTile>
                    </div>
                )}
            </section>
        </>
    );
};

const QueueTile = ({ to, icon, tone, label, value, loading, error, hint }) => (
    <Link to={to} className="block">
        <Card padding="md" className="h-full transition-colors hover:bg-surface-hover">
            <div className="flex items-start gap-3">
                <IconBadge icon={icon} tone={tone} />
                <div className="min-w-0 flex-1">
                    <p className="text-xs text-text-muted">{label}</p>
                    <div className="mt-0.5 text-2xl font-semibold tabular-nums text-text">
                        {loading ? <Skeleton className="h-7 w-10" /> : error ? '—' : formatNumber(value ?? 0)}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-text-muted">{error ? 'Could not load this count.' : hint}</p>
                </div>
                <ArrowRight size={16} className="mt-1 shrink-0 text-text-muted" aria-hidden="true" />
            </div>
        </Card>
    </Link>
);

const StatTile = ({ label, loading, children }) => (
    <Card padding="md">
        <p className="text-xs text-text-muted">{label}</p>
        <div className="mt-1 text-lg font-semibold tabular-nums text-text">
            {loading ? <Skeleton className="h-6 w-20" /> : children}
        </div>
    </Card>
);

export default AdminOverview;
