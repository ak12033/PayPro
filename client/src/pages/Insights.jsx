import React, { Suspense, lazy, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, TrendingUp, PiggyBank, Target, ArrowRight, Receipt, Calculator, Scale } from 'lucide-react';
import PageHeader, { SectionHeading } from '../components/layout/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Skeleton from '../components/ui/Skeleton';
import Amount from '../components/ui/Amount';
import IconBadge from '../components/ui/IconBadge';
import EmptyState from '../components/feedback/EmptyState';
import ErrorState from '../components/feedback/ErrorState';
import InsightCard from '../features/ai/InsightCard';
import AssistantSheet from '../features/ai/AssistantSheet';
import CashFlowSummary from '../features/dashboard/CashFlowSummary';
import MerchantBreakdown from '../features/dashboard/MerchantBreakdown';
import TopExpenses from '../features/dashboard/TopExpenses';
import SpendingRhythm from '../features/insights/SpendingRhythm';
import useBudget from '../features/budget/hooks/useBudget';
import useGoals from '../features/goals/hooks/useGoals';
import useQuery from '../hooks/useQuery';
import { transactionApi } from '../services/api/endpoints/transactionApi';
import { aiApi } from '../services/api/endpoints/aiApi';
import { analyticsApi } from '../services/api/endpoints/analyticsApi';
import { insightsApi } from '../services/api/endpoints/insightsApi';
import { recurringApi } from '../services/api/endpoints/recurringApi';
import FinancialHealthCard from '../features/health/FinancialHealthCard';
import UpcomingCard from '../features/recurring/UpcomingCard';
import { toRupees } from '../constants/budget';
import { ROUTES } from '../constants/routes';

/**
 * Recharts, loaded here and nowhere else.
 *
 * It was previously imported by the dashboard, which meant every user paid for
 * a charting library on the app's most-visited screen in order to render a
 * three-slice pie chart. Insights is the only page with a real reason to plot
 * anything, and it is a page users choose to visit.
 */
const SpendingChart = lazy(() => import('../features/insights/SpendingChart'));

/**
 * Insights.
 *
 * This is where AI lives now, and the placement is the point.
 *
 * The old product put AI everywhere: a permanently visible, pulsing "Ask AI
 * Assistant" button pinned to the bottom of the sidebar on every screen,
 * competing with navigation. That is AI as decoration — it advertises the
 * technology rather than serving a need, and a glowing gradient button next to
 * "Transactions" implies the assistant is as important as your money, which it
 * is not.
 *
 * Where AI genuinely earns its place, and where it does not:
 *
 *   KEEP — **spending insights**. Summarising fifty transactions into "you
 *   spent 40% more on food this month" is real synthesis a person cannot do at
 *   a glance. This is the strongest case in the product.
 *
 *   KEEP — **transaction categorisation**. Already server-side, already
 *   invisible, already useful. The best AI in this product is the AI the user
 *   never sees.
 *
 *   KEEP, DEMOTED — **the assistant**. Useful for "how much did I spend on
 *   travel?", which is a question the filters answer badly. It belongs on this
 *   page, not on every page.
 *
 *   KEEP, RESHAPED — **fraud detection**. Server-side risk scoring is
 *   valuable, but it must never *present itself* as AI. A user being warned
 *   about a suspicious transfer needs to trust the warning; framing it as a
 *   language-model opinion undermines exactly the thing that makes it work.
 *
 * Everything AI-generated on this page is labelled and carries the caveat that
 * it is not financial advice.
 */
const Insights = () => {
    const [assistantOpen, setAssistantOpen] = useState(false);

    const summary = useQuery(async () => (await transactionApi.getSummary()).data);
    const budget = useBudget();
    const goals = useGoals('active');
    const cashflow = useQuery(async () => (await analyticsApi.getCashflow('6M')).data);
    const merchants = useQuery(async () => (await analyticsApi.getMerchants('1M', 8)).data?.merchants ?? []);
    const topExpenses = useQuery(async () => (await analyticsApi.getTopExpenses('1M', 8)).data?.transactions ?? []);
    const rhythm = useQuery(async () => (await analyticsApi.getSpendingRhythm('3M')).data);
    const deterministicInsights = useQuery(async () => (await insightsApi.list('active')).data?.insights ?? []);
    const health = useQuery(async () => (await analyticsApi.getFinancialHealth()).data);
    const upcoming = useQuery(async () => (await recurringApi.getUpcoming(30)).data);

    /**
     * Insights are fetched on demand, not on mount.
     *
     * Every call spends real money on a rate-limited Gemini key. Firing one
     * automatically for every visitor — including the ones who bounce — is a
     * cost with no corresponding user benefit, and it makes the page's time to
     * first paint depend on a language model.
     */
    const insights = useQuery(
        async () => (await aiApi.getInsights()).data,
        { enabled: false }
    );

    const totals = summary.data ?? {};

    return (
        <>
            <PageHeader
                title="Insights"
                subtitle="Where your money went, and what changed."
            />

            {/* ------------------------------------------------------ totals */}
            <div className="grid gap-3 sm:grid-cols-3">
                <StatTile label="Sent" value={totals.sent} loading={summary.loading} direction="out" />
                <StatTile label="Received" value={totals.received} loading={summary.loading} direction="in" />
                <StatTile label="Added" value={totals.added} loading={summary.loading} direction="in" />
            </div>

            {summary.error && (
                <Card className="mt-4">
                    <ErrorState
                        title="Could not load your totals"
                        message={summary.error}
                        onRetry={summary.retry}
                    />
                </Card>
            )}

            {/* ------------------------------------------------------- chart */}
            <section className="mt-6" aria-labelledby="breakdown-heading">
                <SectionHeading id="breakdown-heading" title="Breakdown" />

                <Card>
                    <Suspense fallback={<Skeleton className="h-56 w-full" rounded="rounded-card" />}>
                        {summary.loading ? (
                            <Skeleton className="h-56 w-full" rounded="rounded-card" />
                        ) : (
                            <SpendingChart
                                sent={totals.sent}
                                received={totals.received}
                                added={totals.added}
                            />
                        )}
                    </Suspense>
                </Card>
            </section>

            {/* ----------------------------------------------------- cash flow */}
            <section className="mt-6" aria-labelledby="cashflow-heading">
                <SectionHeading id="cashflow-heading" title="Cash flow" />
                <CashFlowSummary
                    data={cashflow.data}
                    loading={cashflow.loading}
                    error={cashflow.error}
                    onRetry={cashflow.retry}
                />
            </section>

            {/* ----------------------------------------- financial health */}
            <section className="mt-6" aria-labelledby="health-heading">
                <SectionHeading id="health-heading" title="Financial health" />
                <FinancialHealthCard health={health.data} loading={health.loading} />
            </section>

            {/* ------------------------------------------------ budgets/goals */}
            <section className="mt-6 grid gap-3 sm:grid-cols-2" aria-labelledby="money-management-heading">
                <h2 id="money-management-heading" className="sr-only">Budgets and goals</h2>

                <Link to={ROUTES.BUDGETS} className="block">
                    <Card className="transition-[background-color,transform,box-shadow] duration-[--duration-fast] ease-[--ease-out] hover:-translate-y-1 hover:bg-surface-hover hover:shadow-raised">
                        <div className="flex items-start gap-3">
                            <IconBadge icon={<PiggyBank size={17} />} tone="accent" />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-text">Budgets</p>
                                {budget.data?.budget ? (
                                    <p className="mt-0.5 text-xs leading-5 text-text-muted">
                                        <Amount minor={budget.data.spend.totalMinor} size="sm" showFraction={false} />
                                        {budget.data.budget.totalLimitMinor != null && ` of ₹${toRupees(budget.data.budget.totalLimitMinor).toFixed(0)} spent`}
                                    </p>
                                ) : (
                                    <p className="mt-0.5 text-xs leading-5 text-text-muted">Set a monthly limit</p>
                                )}
                            </div>
                            <ArrowRight size={16} className="mt-1 shrink-0 text-text-muted" aria-hidden="true" />
                        </div>
                    </Card>
                </Link>

                <Link to={ROUTES.GOALS} className="block">
                    <Card className="transition-[background-color,transform,box-shadow] duration-[--duration-fast] ease-[--ease-out] hover:-translate-y-1 hover:bg-surface-hover hover:shadow-raised">
                        <div className="flex items-start gap-3">
                            <IconBadge icon={<Target size={17} />} tone="positive" />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-text">Goals</p>
                                <p className="mt-0.5 text-xs leading-5 text-text-muted">
                                    {goals.data?.length ? `${goals.data.length} active` : 'Start tracking a savings goal'}
                                </p>
                            </div>
                            <ArrowRight size={16} className="mt-1 shrink-0 text-text-muted" aria-hidden="true" />
                        </div>
                    </Card>
                </Link>

                <Link to={ROUTES.BILLS} className="block">
                    <Card className="transition-[background-color,transform,box-shadow] duration-[--duration-fast] ease-[--ease-out] hover:-translate-y-1 hover:bg-surface-hover hover:shadow-raised">
                        <div className="flex items-start gap-3">
                            <IconBadge icon={<Receipt size={17} />} tone="warning" />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-text">Bills &amp; repeat payments</p>
                                <p className="mt-0.5 text-xs leading-5 text-text-muted">
                                    {upcoming.data?.items?.length
                                        ? `${upcoming.data.items.length} expected in 30 days`
                                        : 'Reminders only — PayPro never pays them'}
                                </p>
                            </div>
                            <ArrowRight size={16} className="mt-1 shrink-0 text-text-muted" aria-hidden="true" />
                        </div>
                    </Card>
                </Link>

                <Link to={ROUTES.TOOLS} className="block">
                    <Card className="transition-[background-color,transform,box-shadow] duration-[--duration-fast] ease-[--ease-out] hover:-translate-y-1 hover:bg-surface-hover hover:shadow-raised">
                        <div className="flex items-start gap-3">
                            <IconBadge icon={<Calculator size={17} />} tone="neutral" />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-text">Calculators</p>
                                <p className="mt-0.5 text-xs leading-5 text-text-muted">Work out an EMI</p>
                            </div>
                            <ArrowRight size={16} className="mt-1 shrink-0 text-text-muted" aria-hidden="true" />
                        </div>
                    </Card>
                </Link>

                <Link to={ROUTES.PORTFOLIO} className="block">
                    <Card className="transition-[background-color,transform,box-shadow] duration-[--duration-fast] ease-[--ease-out] hover:-translate-y-1 hover:bg-surface-hover hover:shadow-raised">
                        <div className="flex items-start gap-3">
                            <IconBadge icon={<Scale size={17} />} tone="neutral" />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-text">Net worth</p>
                                <p className="mt-0.5 text-xs leading-5 text-text-muted">Track investments and debts you hold elsewhere</p>
                            </div>
                            <ArrowRight size={16} className="mt-1 shrink-0 text-text-muted" aria-hidden="true" />
                        </div>
                    </Card>
                </Link>
            </section>

            {/* ------------------------------------------------ what's coming */}
            <section className="mt-6" aria-labelledby="upcoming-heading">
                <h2 id="upcoming-heading" className="sr-only">Upcoming payments</h2>
                <UpcomingCard query={upcoming} />
            </section>

            {/* --------------------------------------------------- merchants */}
            <section className="mt-6 grid gap-6 lg:grid-cols-2" aria-labelledby="merchants-heading">
                <h2 id="merchants-heading" className="sr-only">Merchants and top expenses</h2>
                <MerchantBreakdown
                    merchants={merchants.data}
                    loading={merchants.loading}
                    error={merchants.error}
                    onRetry={merchants.retry}
                />
                <TopExpenses
                    transactions={topExpenses.data}
                    loading={topExpenses.loading}
                    error={topExpenses.error}
                    onRetry={topExpenses.retry}
                />
            </section>

            {/* ---------------------------------------------- spending rhythm */}
            <section className="mt-6" aria-labelledby="rhythm-heading">
                <h2 id="rhythm-heading" className="sr-only">When you spend</h2>
                <SpendingRhythm
                    data={rhythm.data}
                    loading={rhythm.loading}
                    error={rhythm.error}
                    onRetry={rhythm.retry}
                />
            </section>

            {/* ------------------------------------------- computed insights */}
            {deterministicInsights.data?.length > 0 && (
                <section className="mt-6" aria-labelledby="computed-heading">
                    <SectionHeading id="computed-heading" title="Worth knowing" />
                    <div className="space-y-3">
                        {deterministicInsights.data.map((insight) => (
                            <InsightCard key={insight._id} insight={insight} />
                        ))}
                    </div>
                </section>
            )}

            {/* ---------------------------------------------------- AI block */}
            <section className="mt-6" aria-labelledby="ai-heading">
                <SectionHeading id="ai-heading" title="AI analysis" />

                {insights.error ? (
                    <Card>
                        <ErrorState
                            title="Analysis unavailable"
                            message={insights.error}
                            reassurance="This does not affect your transactions or balance."
                            onRetry={insights.retry}
                        />
                    </Card>
                ) : insights.loading ? (
                    <div className="space-y-3">
                        <Skeleton className="h-24 w-full" rounded="rounded-card" />
                        <Skeleton className="h-24 w-full" rounded="rounded-card" />
                    </div>
                ) : insights.data?.insights?.length > 0 ? (
                    <div className="space-y-3">
                        {insights.data.insights.map((insight, index) => (
                            <InsightCard key={`${insight.title}-${index}`} insight={insight} />
                        ))}
                    </div>
                ) : insights.data ? (
                    <Card>
                        <EmptyState
                            variant="no-results"
                            icon={<TrendingUp size={20} />}
                            title="Not enough activity yet"
                            description="Once you have a few more transactions, we can spot patterns worth telling you about."
                        />
                    </Card>
                ) : (
                    /* The opt-in. The user asks; we do not assume. */
                    <Card className="border-ai/20 bg-ai-soft/40">
                        <div className="flex items-start gap-3">
                            <span
                                aria-hidden="true"
                                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ai-soft text-ai"
                            >
                                <Sparkles size={17} />
                            </span>
                            <div className="min-w-0 flex-1">
                                <h3 className="text-sm font-semibold text-text">
                                    Analyse my spending
                                </h3>
                                <p className="mt-1 text-sm leading-6 text-text-secondary">
                                    We'll look at your last 50 transactions and point out patterns,
                                    unusual charges and where you might save.
                                </p>
                                <Button
                                    variant="ai"
                                    className="mt-3"
                                    onClick={insights.retry}
                                    icon={<Sparkles size={15} />}
                                >
                                    Generate insights
                                </Button>
                            </div>
                        </div>
                    </Card>
                )}
            </section>

            {/* -------------------------------------------------- assistant */}
            <Card className="mt-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-text">Ask about your money</h2>
                        <p className="mt-0.5 text-sm text-text-muted">
                            "How much did I spend on food last month?"
                        </p>
                    </div>
                    <Button variant="secondary" onClick={() => setAssistantOpen(true)}>
                        Open assistant
                    </Button>
                </div>
            </Card>

            <AssistantSheet open={assistantOpen} onClose={() => setAssistantOpen(false)} />
        </>
    );
};

const StatTile = ({ label, value, loading, direction }) => (
    <Card padding="md">
        <p className="text-xs text-text-muted">{label}</p>
        <div className="mt-1.5 min-h-7">
            {loading ? (
                <Skeleton className="h-6 w-24" />
            ) : (
                <Amount value={value} direction={direction} size="lg" showFraction={false} />
            )}
        </div>
    </Card>
);

export default Insights;
