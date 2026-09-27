import React, { Suspense, lazy, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import BalanceCard from '../features/wallet/BalanceCard';
import TransactionDetailSheet from '../features/transactions/TransactionDetailSheet';
import ActivityTimeline from '../features/dashboard/ActivityTimeline';
import TimeframeSelector from '../features/dashboard/TimeframeSelector';
import KpiTile from '../features/dashboard/KpiTile';
import ChartCardSkeleton from '../features/dashboard/ChartCardSkeleton';
import { useDashboardOverview } from '../features/dashboard/hooks/useDashboardOverview';
import { useCategoryBreakdown } from '../features/dashboard/hooks/useCategoryBreakdown';
import { useNetworkGrowth } from '../features/dashboard/hooks/useNetworkGrowth';
import { usePaymentsStatus } from '../features/dashboard/hooks/usePaymentsStatus';
import { SectionHeading } from '../components/layout/PageHeader';
import Card from '../components/ui/Card';
import IconBadge from '../components/ui/IconBadge';
import AmbientGlow from '../components/ui/AmbientGlow';
import BudgetSummaryCard from '../features/budget/BudgetSummaryCard';
import VerifyEmailBanner from '../features/account/VerifyEmailBanner';
import useBudget from '../features/budget/hooks/useBudget';
import { ROUTES } from '../constants/routes';

/**
 * Home.
 *
 * The dashboard answers, in order: *how much do I have* (BalanceCard, always
 * first — nothing about the analytics below is worth more than that), *is my
 * money moving in a good direction* (the KPI row and the performance/cash-flow
 * charts), *where did it go and who to* (category breakdown, network growth),
 * *can I trust it to go through* (transaction analytics, success rate), and
 * *what just happened* (the activity timeline).
 *
 * Every number below the balance card comes from `Transaction`/`Payment`
 * aggregates computed server-side (`/api/analytics/*`) — nothing here is
 * client-reduced or invented. Each chart fetches independently, so one
 * endpoint failing degrades one card, never the page.
 *
 * Recharts-heavy chart components are lazy-loaded, the same technique
 * `Insights.jsx` uses for `SpendingChart`: the charting bundle lands on the
 * dashboard's chart region, not on `BalanceCard`/Send/Add, which stay
 * instant regardless of how long the analytics take to load.
 */
const PerformanceHero = lazy(() => import('../features/dashboard/PerformanceHero'));
const CashFlowChart = lazy(() => import('../features/dashboard/CashFlowChart'));
const CategoryBreakdown = lazy(() => import('../features/dashboard/CategoryBreakdown'));
const TransactionStatusChart = lazy(() => import('../features/dashboard/TransactionStatusChart'));
const NetworkGrowthChart = lazy(() => import('../features/dashboard/NetworkGrowthChart'));
const SuccessRateKpi = lazy(() => import('../features/dashboard/SuccessRateKpi'));

const Home = () => {
    const { userName, balanceMinor, recentTransactions, isCheckingAuth } = useAuth();
    const [selected, setSelected] = useState(null);
    const [range, setRange] = useState('1M');

    const overview = useDashboardOverview(range);
    const categories = useCategoryBreakdown(range);
    const network = useNetworkGrowth(range);
    const paymentsStatus = usePaymentsStatus(range);
    const budget = useBudget();

    const summary = overview.data?.summary;
    const series = overview.data?.series ?? [];

    return (
        <>
            {/* Hero region only — the ambient glow is structurally confined to
                this wrapper (absolute + overflow-hidden) so it can never reach
                the charts, ledger or lists further down the page. Home is the
                one authenticated screen with a true "hero" (the balance), so
                it gets a much quieter version of the same glow the landing and
                auth screens use — a dashboard someone checks dozens of times a
                day should not compete with the numbers on it. */}
            <div className="relative overflow-hidden">
                <AmbientGlow className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-[0.05]" />

                <h1 className="mb-4 text-sm font-normal text-text-muted">
                    {greeting()}
                    {userName ? `, ${userName}` : ''}
                </h1>

                <VerifyEmailBanner className="mb-4" />

                <BalanceCard balanceMinor={balanceMinor} loading={isCheckingAuth} />

                {/* ------------------------------------------ executive overview */}
                <section className="mt-6" aria-labelledby="performance-heading">
                    <SectionHeading
                        id="performance-heading"
                        title="Performance"
                        action={<TimeframeSelector value={range} onChange={setRange} />}
                    />

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <KpiTile
                            label="Money in"
                            value={summary?.moneyIn}
                            loading={overview.loading}
                            sparkline={series.map((p) => p.moneyIn)}
                        />
                        <KpiTile
                            label="Money out"
                            value={summary?.moneyOut}
                            loading={overview.loading}
                            sparkline={series.map((p) => p.moneyOut)}
                        />
                        <KpiTile
                            label="Net cash flow"
                            value={summary?.netCashFlow}
                            deltaPct={summary?.growthPct}
                            loading={overview.loading}
                            sparkline={series.map((p) => p.net)}
                        />
                        <KpiTile
                            label="Transactions"
                            value={summary?.transactionCount}
                            format="number"
                            loading={overview.loading}
                        />
                    </div>
                </section>
            </div>

            {/* ------------------------------------------------ budget summary */}
            <div className="mt-6">
                <BudgetSummaryCard
                    data={budget.data}
                    loading={budget.loading}
                    error={budget.error}
                    onRetry={budget.retry}
                    compact
                />
            </div>

            {/* --------------------------------------------------------- chart 1 */}
            <div className="mt-6">
                <Suspense fallback={<ChartCardSkeleton height="h-72" />}>
                    <PerformanceHero
                        overview={overview.data}
                        loading={overview.loading}
                        error={overview.error}
                        onRetry={overview.retry}
                        range={range}
                    />
                </Suspense>
            </div>

            {/* --------------------------------------------------------- chart 2 */}
            <div className="mt-6">
                <Suspense fallback={<ChartCardSkeleton />}>
                    <CashFlowChart
                        overview={overview.data}
                        loading={overview.loading}
                        error={overview.error}
                        onRetry={overview.retry}
                        range={range}
                    />
                </Suspense>
            </div>

            {/* ----------------------------------------------- chart 4+5, chart 3 */}
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <Suspense fallback={<ChartCardSkeleton />}>
                    <CategoryBreakdown
                        categories={categories.data}
                        loading={categories.loading}
                        error={categories.error}
                        onRetry={categories.retry}
                    />
                </Suspense>
                <Suspense fallback={<ChartCardSkeleton />}>
                    <TransactionStatusChart
                        paymentsStatus={paymentsStatus.data}
                        loading={paymentsStatus.loading}
                        error={paymentsStatus.error}
                        onRetry={paymentsStatus.retry}
                    />
                </Suspense>
            </div>

            {/* --------------------------------------------------- chart 6, chart 7 */}
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <Suspense fallback={<ChartCardSkeleton height="h-56" />}>
                    <NetworkGrowthChart
                        network={network.data}
                        loading={network.loading}
                        error={network.error}
                        onRetry={network.retry}
                        range={range}
                    />
                </Suspense>
                <Suspense fallback={<ChartCardSkeleton height="h-36" />}>
                    <SuccessRateKpi
                        paymentsStatus={paymentsStatus.data}
                        loading={paymentsStatus.loading}
                        error={paymentsStatus.error}
                        onRetry={paymentsStatus.retry}
                    />
                </Suspense>
            </div>

            {/* --------------------------------------------------------- chart 8 */}
            <div className="mt-6">
                <ActivityTimeline
                    transactions={recentTransactions}
                    loading={isCheckingAuth}
                    onSelect={setSelected}
                />
            </div>

            {/* ---------------------------------------------------- quick links */}
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <Link to={ROUTES.INSIGHTS} className="block">
                    <Card className="transition-[background-color,transform,box-shadow] duration-[--duration-fast] ease-[--ease-out] hover:-translate-y-1 hover:bg-surface-hover hover:shadow-raised">
                        <div className="flex items-start gap-3">
                            <IconBadge icon={<Sparkles size={17} />} tone="ai" />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-text">Spending insights</p>
                                <p className="mt-0.5 text-xs leading-5 text-text-muted">
                                    See where your money went this month and what changed.
                                </p>
                            </div>
                            <ArrowRight size={16} className="mt-1 shrink-0 text-text-muted" aria-hidden="true" />
                        </div>
                    </Card>
                </Link>

                <Link to={ROUTES.SECURITY} className="block">
                    <Card className="transition-[background-color,transform,box-shadow] duration-[--duration-fast] ease-[--ease-out] hover:-translate-y-1 hover:bg-surface-hover hover:shadow-raised">
                        <div className="flex items-start gap-3">
                            <IconBadge icon={<ShieldCheck size={17} />} tone="positive" />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-text">Security</p>
                                <p className="mt-0.5 text-xs leading-5 text-text-muted">
                                    Review your signed-in devices and recent sign-in attempts.
                                </p>
                            </div>
                            <ArrowRight size={16} className="mt-1 shrink-0 text-text-muted" aria-hidden="true" />
                        </div>
                    </Card>
                </Link>
            </div>

            <TransactionDetailSheet
                transaction={selected}
                open={Boolean(selected)}
                onClose={() => setSelected(null)}
            />
        </>
    );
};

/** Time-of-day greeting. Uses the device clock; no server round-trip for this. */
const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
};

export default Home;
