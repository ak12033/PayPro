import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Receipt, Sparkles, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import useQuery from '../hooks/useQuery';
import { transactionApi } from '../services/api/endpoints/transactionApi';
import BalanceCard from '../features/wallet/BalanceCard';
import TransactionRow from '../features/transactions/TransactionRow';
import TransactionDetailSheet from '../features/transactions/TransactionDetailSheet';
import { SectionHeading } from '../components/layout/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { SkeletonRows } from '../components/ui/Skeleton';
import EmptyState from '../components/feedback/EmptyState';
import ErrorState from '../components/feedback/ErrorState';
import { ROUTES } from '../constants/routes';
import { RECENT_PREVIEW_COUNT } from '../constants/transactions';
import { groupByDay } from '../utils/formatters';
import { ListGroupHeader } from '../components/ui/List';

/**
 * Home.
 *
 * The screen answers, in this order, the three questions that actually bring
 * someone here: *how much do I have*, *what just happened*, and *is there
 * anything I need to deal with*. Everything else was moved or removed.
 *
 * What is gone from the old dashboard, and why:
 *
 *   The four stat tiles. "Total sent" and "Total received" are lifetime
 *   aggregates. Nobody opens a wallet at a checkout to review their lifetime
 *   outbound volume. They now live on Insights.
 *
 *   The donut chart. A three-slice pie of sent/received/added is a chart that
 *   cannot answer a question. "I sent more than I received" is not actionable,
 *   and the shape carried no information the three numbers beside it did not
 *   already carry — while costing every visitor the Recharts bundle on the
 *   app's most-loaded page. Recharts is now loaded only on Insights, where
 *   there is an actual time series to plot.
 *
 * What is new: a first-run state that acknowledges an empty wallet as normal
 * and points at the one action that resolves it, instead of an empty list that
 * looks like a failure.
 */
const Home = () => {
    const { userName, balance, recentTransactions, isCheckingAuth } = useAuth();
    const [selected, setSelected] = useState(null);

    const summary = useQuery(
        async () => (await transactionApi.getSummary()).data,
        { initialData: null }
    );

    const recent = (recentTransactions ?? []).slice(0, RECENT_PREVIEW_COUNT);
    const hasActivity = recent.length > 0;
    const groups = groupByDay(recent);

    return (
        <>
            {/*
             * The greeting is the page's <h1>.
             *
             * It is also the one place a name adds something: it confirms
             * *whose* account is on screen, which on a shared device is a real
             * check.
             *
             * Every page needs exactly one top-level heading, and inventing a
             * silent "Home" heading to sit beside a visible greeting would give
             * screen-reader users a different page title from everyone else.
             * Styled as body text because the balance below is the headline —
             * heading *level* is document structure, not type scale.
             */}
            <h1 className="mb-4 text-sm font-normal text-text-muted">
                {greeting()}
                {userName ? `, ${userName}` : ''}
            </h1>

            <BalanceCard balance={balance} loading={isCheckingAuth} />

            <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
                <section aria-labelledby="recent-heading">
                    <SectionHeading
                        id="recent-heading"
                        title="Recent activity"
                        action={
                            hasActivity && (
                                <Link
                                    to={ROUTES.ACTIVITY}
                                    className="inline-flex items-center gap-1 rounded-control px-2 py-1 text-sm font-medium text-accent-text hover:bg-surface-hover"
                                >
                                    See all
                                    <ArrowRight size={14} aria-hidden="true" />
                                </Link>
                            )
                        }
                    />

                    <Card padding="sm">
                        {isCheckingAuth ? (
                            <SkeletonRows count={4} />
                        ) : hasActivity ? (
                            <ul>
                                {groups.map((group) => (
                                    <React.Fragment key={group.key}>
                                        <ListGroupHeader>{group.label}</ListGroupHeader>
                                        {group.items.map((transaction) => (
                                            <TransactionRow
                                                key={transaction._id}
                                                transaction={transaction}
                                                onSelect={setSelected}
                                            />
                                        ))}
                                    </React.Fragment>
                                ))}
                            </ul>
                        ) : (
                            <EmptyState
                                variant="first-run"
                                icon={<Receipt size={20} />}
                                title="No activity yet"
                                description="Add money to your wallet, then send your first transfer. Everything you do will appear here."
                                action={
                                    <Link to={ROUTES.ADD_MONEY}>
                                        <Button variant="primary">Add money</Button>
                                    </Link>
                                }
                            />
                        )}
                    </Card>
                </section>

                <div className="space-y-4">
                    {/*
                     * Insights is a *link*, not a live AI panel.
                     *
                     * Generating insights costs a rate-limited Gemini call, and
                     * firing one on every dashboard mount would spend that
                     * budget on users who never scroll to it — and make the
                     * home screen's load time depend on a language model. The
                     * user opts in.
                     */}
                    <Link to={ROUTES.INSIGHTS} className="block">
                        <Card className="transition-colors hover:bg-surface-hover">
                            <div className="flex items-start gap-3">
                                <span
                                    aria-hidden="true"
                                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ai-soft text-ai"
                                >
                                    <Sparkles size={17} />
                                </span>
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
                        <Card className="transition-colors hover:bg-surface-hover">
                            <div className="flex items-start gap-3">
                                <span
                                    aria-hidden="true"
                                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-positive-soft text-positive"
                                >
                                    <ShieldCheck size={17} />
                                </span>
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

                    {/*
                     * The summary strip degrades rather than disappearing. A
                     * failed aggregate must not blank the screen — and it must
                     * not silently show zeros either, which is what the old
                     * dashboard did when this request failed.
                     */}
                    {summary.error ? (
                        <Card padding="md">
                            <ErrorState
                                title="Summary unavailable"
                                message={summary.error}
                                reassurance={null}
                                onRetry={summary.retry}
                            />
                        </Card>
                    ) : null}
                </div>
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
