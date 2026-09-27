import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { PiggyBank, Plus, Landmark } from 'lucide-react';
import PageHeader, { SectionHeading } from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Amount from '../../components/ui/Amount';
import Skeleton from '../../components/ui/Skeleton';
import List, { ListRow } from '../../components/ui/List';
import { DetailRow } from '../../components/ui/List';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import AllocationBar from '../../features/portfolio/AllocationBar';
import PortfolioEntrySheet from '../../features/portfolio/PortfolioEntrySheet';
import { ASSET_LABEL, LIABILITY_LABEL, PORTFOLIO_DISCLAIMER } from '../../features/portfolio/portfolio';
import useQuery from '../../hooks/useQuery';
import { portfolioApi } from '../../services/api/endpoints/portfolioApi';
import { getErrorMessage } from '../../utils/errors';
import { formatDate } from '../../utils/formatters';

/**
 * Net worth, holdings and debts (plan.md §21, §22) — a tracker of numbers the
 * holder types in. The disclaimer sits under the heading, every value shows the
 * date it was last updated, and there is nothing to buy, sell or apply for.
 */
const Portfolio = () => {
    const data = useQuery(async () => {
        const [summary, holdings, liabilities] = await Promise.all([
            portfolioApi.summary(), portfolioApi.holdings(), portfolioApi.liabilities(),
        ]);
        return { summary: summary.data.summary, holdings: holdings.data.holdings, liabilities: liabilities.data.liabilities };
    });
    const [sheet, setSheet] = useState(null); // { kind, entry }
    const [saving, setSaving] = useState(false);

    const run = async (work, message) => {
        setSaving(true);
        try {
            await work();
            setSheet(null);
            data.refresh();
        } catch (err) {
            toast.error(getErrorMessage(err, message));
        } finally {
            setSaving(false);
        }
    };

    const save = (payload) => run(async () => {
        const { kind, entry } = sheet;
        if (kind === 'holding') {
            if (entry) await portfolioApi.updateHolding(entry._id, payload);
            else await portfolioApi.createHolding(payload);
        } else if (entry) await portfolioApi.updateLiability(entry._id, payload);
        else await portfolioApi.createLiability(payload);
    }, 'Could not save this.');

    const remove = () => run(async () => {
        const { kind, entry } = sheet;
        if (kind === 'holding') await portfolioApi.removeHolding(entry._id);
        else await portfolioApi.removeLiability(entry._id);
    }, 'Could not remove this.');

    const s = data.data?.summary;
    const holdings = data.data?.holdings ?? [];
    const liabilities = data.data?.liabilities ?? [];

    return (
        <>
            <PageHeader title="Net worth" subtitle={PORTFOLIO_DISCLAIMER} back={true} />

            {data.error ? (
                <ErrorState title="Portfolio unavailable" message={data.error} onRetry={data.retry} reassurance={null} />
            ) : data.loading ? (
                <div className="space-y-4">
                    <Skeleton className="h-32 w-full" rounded="rounded-card" />
                    <Skeleton className="h-48 w-full" rounded="rounded-card" />
                </div>
            ) : (
                <div className="space-y-6">
                    <Card variant="glass">
                        <p className="text-sm text-text-muted">Net worth</p>
                        <div className="mt-1"><Amount minor={s.netWorthMinor} size="xl" /></div>
                        <dl className="mt-4 divide-y divide-border border-t border-border">
                            <DetailRow label="Investments" value={<Amount minor={s.holdingsValueMinor} size="sm" />} />
                            <DetailRow label="PayPro balance" value={<Amount minor={s.walletMinor} size="sm" />} />
                            <DetailRow label="Debts" value={<Amount minor={-s.liabilitiesMinor} size="sm" />} />
                            {s.monthlyEmiMinor > 0 && <DetailRow label="EMIs each month" value={<Amount minor={s.monthlyEmiMinor} size="sm" />} />}
                        </dl>
                        {s.oldestValueAt && (
                            <p className="mt-3 text-xs text-text-muted">Your oldest investment value was entered on {formatDate(s.oldestValueAt)}.</p>
                        )}
                    </Card>

                    <section>
                        <SectionHeading
                            title="Investments"
                            action={<Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={() => setSheet({ kind: 'holding' })}>Add</Button>}
                        />
                        <Card padding={holdings.length ? 'lg' : 'none'}>
                            {holdings.length ? (
                                <div className="space-y-5">
                                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                                        <span className="text-sm text-text-muted">Invested <Amount minor={s.investedMinor} size="sm" /></span>
                                        {s.gainPercent != null && (
                                            <span className="text-sm text-text-muted">
                                                {s.gainMinor >= 0 ? 'Up' : 'Down'} <Amount minor={Math.abs(s.gainMinor)} size="sm" /> ({Math.abs(s.gainPercent)}%)
                                            </span>
                                        )}
                                    </div>
                                    <AllocationBar allocation={s.allocation} />
                                    <List className="-mx-6">
                                        {holdings.map((h) => (
                                            <ListRow
                                                key={h._id}
                                                title={h.name}
                                                subtitle={`${ASSET_LABEL[h.assetType]} · value as of ${formatDate(h.valueUpdatedAt)}`}
                                                trailing={<Amount minor={h.currentValueMinor} size="sm" />}
                                                meta={h.gainPercent != null ? `${h.gainPercent >= 0 ? '+' : ''}${h.gainPercent}%` : null}
                                                onClick={() => setSheet({ kind: 'holding', entry: h })}
                                            />
                                        ))}
                                    </List>
                                </div>
                            ) : (
                                <EmptyState
                                    icon={<PiggyBank size={20} />}
                                    title="No investments tracked"
                                    description="Add what you hold elsewhere — funds, shares, deposits, gold — to see it next to your PayPro balance."
                                    action={<Button variant="primary" onClick={() => setSheet({ kind: 'holding' })}>Add an investment</Button>}
                                />
                            )}
                        </Card>
                    </section>

                    <section>
                        <SectionHeading
                            title="Debts"
                            action={<Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={() => setSheet({ kind: 'liability' })}>Add</Button>}
                        />
                        <Card padding="none">
                            {liabilities.length ? (
                                <List>
                                    {liabilities.map((l) => (
                                        <ListRow
                                            key={l._id}
                                            title={l.lender}
                                            subtitle={[LIABILITY_LABEL[l.kind], l.emiMinor ? `EMI ₹${(l.emiMinor / 100).toLocaleString('en-IN')}${l.emiDueDay ? ` on day ${l.emiDueDay}` : ''}` : null, l.interestRate != null ? `${l.interestRate}% a year` : null].filter(Boolean).join(' · ')}
                                            trailing={<Amount minor={l.outstandingMinor} size="sm" />}
                                            meta={`as of ${formatDate(l.outstandingUpdatedAt)}`}
                                            onClick={() => setSheet({ kind: 'liability', entry: l })}
                                        />
                                    ))}
                                </List>
                            ) : (
                                <EmptyState
                                    icon={<Landmark size={20} />}
                                    title="No debts tracked"
                                    description="Add loans or card balances you owe so your net worth counts them. PayPro does not lend."
                                    action={<Button variant="secondary" onClick={() => setSheet({ kind: 'liability' })}>Add a debt</Button>}
                                />
                            )}
                        </Card>
                    </section>
                </div>
            )}

            <PortfolioEntrySheet
                open={Boolean(sheet)}
                onClose={() => setSheet(null)}
                kind={sheet?.kind}
                entry={sheet?.entry}
                onSave={save}
                onRemove={sheet?.entry ? remove : undefined}
                saving={saving}
            />
        </>
    );
};

export default Portfolio;
