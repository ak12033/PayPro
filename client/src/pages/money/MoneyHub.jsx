import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Plus, Send, PenLine } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Amount from '../../components/ui/Amount';
import Skeleton from '../../components/ui/Skeleton';
import IconBadge from '../../components/ui/IconBadge';
import { useAuth } from '../../context/AuthContext';
import { ROUTES } from '../../constants/routes';

/**
 * The Money tab.
 *
 * A deliberate two-choice screen rather than a form. "Move money" is one intent
 * with two directions, and forcing that choice into the navigation — as two of
 * six sidebar entries, which is what it was — makes the user resolve it before
 * they have seen their balance.
 *
 * Balance is repeated here on purpose. It is the input to both decisions, and
 * making someone navigate back to Home to check it before choosing is exactly
 * the kind of small friction that accumulates into "this app is annoying".
 */
const MoneyHub = () => {
    const { balance, isCheckingAuth } = useAuth();

    return (
        <div className="mx-auto max-w-2xl">
            <PageHeader title="Money" />

            <Card variant="glass" className="mb-4">
                <p className="text-sm text-text-muted">Available balance</p>
                <div className="mt-1 min-h-10">
                    {isCheckingAuth ? (
                        <Skeleton className="h-8 w-36" />
                    ) : (
                        <Amount value={balance} size="xl" />
                    )}
                </div>
            </Card>

            <div className="grid gap-3 sm:grid-cols-2">
                <ActionCard
                    to={ROUTES.SEND}
                    icon={Send}
                    tone="accent"
                    title="Send money"
                    description="Transfer to another PayPro account instantly."
                />
                <ActionCard
                    to={ROUTES.ADD_MONEY}
                    icon={Plus}
                    tone="positive"
                    title="Add money"
                    description="Top up your wallet with a card or UPI."
                />
            </div>

            {/*
             * Manual entry, demoted.
             *
             * It writes a row into the ledger that corresponds to no real
             * movement of money, which lets the transaction history and the
             * wallet balance disagree. It is reachable for anyone who was using
             * it, but it is not a peer of the two actions above and is labelled
             * for what it is: bookkeeping, not a payment.
             */}
            <Link to={ROUTES.ACTIVITY_MANUAL_ENTRY} className="mt-3 block">
                <Card padding="md" className="transition-colors hover:bg-surface-hover">
                    <div className="flex items-center gap-3">
                        <PenLine size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-text">Record a transaction</p>
                            <p className="text-xs text-text-muted">
                                Log spending that happened outside PayPro. Does not move money.
                            </p>
                        </div>
                        <ArrowRight size={15} className="shrink-0 text-text-muted" aria-hidden="true" />
                    </div>
                </Card>
            </Link>
        </div>
    );
};

const ActionCard = ({ to, icon: Icon, title, description, tone }) => (
    <Link to={to} className="block">
        <Card className="h-full transition-colors hover:bg-surface-hover">
            <IconBadge icon={<Icon size={19} />} tone={tone} />
            <p className="mt-3 text-base font-semibold text-text">{title}</p>
            <p className="mt-1 text-sm leading-6 text-text-muted">{description}</p>
        </Card>
    </Link>
);

export default MoneyHub;
