import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowUpDown, Download, Receipt, RefreshCw, Search, SearchX, X } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader';
import Card from '../components/ui/Card';
import Button, { IconButton } from '../components/ui/Button';
import SegmentedControl from '../components/ui/SegmentedControl';
import { Input, Select } from '../components/ui/Field';
import { SkeletonRows } from '../components/ui/Skeleton';
import { ListGroupHeader } from '../components/ui/List';
import EmptyState from '../components/feedback/EmptyState';
import ErrorState from '../components/feedback/ErrorState';
import TransactionRow from '../features/transactions/TransactionRow';
import TransactionDetailSheet from '../features/transactions/TransactionDetailSheet';
import useQuery from '../hooks/useQuery';
import useDebouncedValue from '../hooks/useDebouncedValue';
import { useSocket } from '../context/SocketContext';
import { transactionApi } from '../services/api/endpoints/transactionApi';
import { downloadBlob } from '../lib/downloadBlob';
import { groupByDay, getRangeStartDate } from '../utils/formatters';
import { getErrorMessage } from '../utils/errors';
import {
    TRANSACTION_FILTERS,
    DEFAULT_TRANSACTION_FILTER,
    DATE_RANGES,
    DEFAULT_DATE_RANGE,
    HISTORY_PAGE_SIZE,
} from '../constants/transactions';
import toast from 'react-hot-toast';

/**
 * Activity — one ledger.
 *
 * This screen replaces both `/transactions` and `/payment-history`, which were
 * two separate pages describing the same money in incompatible ways. A ₹500
 * top-up appeared in both: in one as a row in a card list with a category and
 * an invoice id, in the other as a row in a table with a Razorpay order id and
 * a status pill. Neither told the user the other existed, neither was labelled
 * as partial, and there was no way to determine which one was authoritative.
 *
 * A person does not have two transaction histories. Top-ups are now a *filter*
 * on the one history, which is what they always were conceptually.
 *
 * Other changes:
 *
 *   **Grouped by day, with sticky headings.** A flat list of forty rows each
 *   carrying its own date is forty repetitions of information that changes
 *   roughly every six rows.
 *
 *   **Filter and search live in the URL.** `?filter=Transfer&q=coffee` is now
 *   shareable, bookmarkable, and survives a refresh — and the browser's back
 *   button steps back through filters instead of leaving the screen entirely,
 *   which is what users expect and what the old local-state version broke.
 *
 *   **Load more, not pagination.** Page numbers make sense for a table you are
 *   auditing. For a personal history that is read chronologically, "page 3 of
 *   7" is a worse model than a continuous list — and the old prev/next buttons
 *   discarded the previous page, so scrolling back required a round trip.
 */
const Activity = () => {
    const [params, setParams] = useSearchParams();
    const [selected, setSelected] = useState(null);
    const [exporting, setExporting] = useState(false);
    const [accumulated, setAccumulated] = useState([]);
    const [page, setPage] = useState(1);
    const { subscribe } = useSocket() ?? {};

    const filter = params.get('filter') ?? DEFAULT_TRANSACTION_FILTER;
    const searchInput = params.get('q') ?? '';
    const search = useDebouncedValue(searchInput);
    /** Set by the dashboard's category donut (`?category=`); exact match, no preset. */
    const category = params.get('category') ?? '';
    const range = params.get('range') ?? DEFAULT_DATE_RANGE;
    const sortOrder = params.get('sort') === 'asc' ? 'asc' : 'desc';

    const { data, loading, refreshing, error, retry, refresh } = useQuery(
        async () => {
            const { data: payload } = await transactionApi.getHistory({
                page,
                limit: HISTORY_PAGE_SIZE,
                filter: filter === DEFAULT_TRANSACTION_FILTER ? undefined : filter,
                search: search || undefined,
                category: category || undefined,
                startDate: getRangeStartDate(range) || undefined,
                sortOrder: sortOrder === 'asc' ? 'asc' : undefined,
            });

            setAccumulated((previous) =>
                // Page 1 replaces; later pages append. Without the replace, a
                // filter change would stack the new results underneath the old
                // ones and show a list matching two different filters at once.
                page === 1 ? (payload.transactions ?? []) : [...previous, ...(payload.transactions ?? [])]
            );

            return payload;
        },
        { deps: [page, filter, search, category, range, sortOrder] }
    );

    /**
     * Reload from the top.
     *
     * A background `refresh()` re-runs the fetcher for whatever page is
     * currently in view, which is only correct when that page is 1 — for any
     * later page it would append the same rows onto `accumulated` a second
     * time. So a refresh first rewinds to page 1 (itself a fetch, via the
     * effect above) and only calls `refresh()` directly when already there.
     */
    const handleRefresh = () => {
        if (page === 1) refresh();
        else setPage(1);
    };

    /** Any control that changes the query must reset to page 1. */
    const updateParams = useCallback(
        (next) => {
            setPage(1);
            setParams(
                (current) => {
                    const updated = new URLSearchParams(current);
                    Object.entries(next).forEach(([key, value]) => {
                        if (value) updated.set(key, value);
                        else updated.delete(key);
                    });
                    return updated;
                },
                // Replace rather than push: every keystroke in the search box
                // would otherwise become a history entry, and Back would walk
                // the user backwards through their own typing one letter at a
                // time.
                { replace: true }
            );
        },
        [setParams]
    );

    const exportCsv = async () => {
        setExporting(true);
        try {
            const response = await transactionApi.exportCsv({
                filter: filter === DEFAULT_TRANSACTION_FILTER ? undefined : filter,
                category: category || undefined,
                search: search || undefined,
                startDate: getRangeStartDate(range) || undefined,
            });
            downloadBlob(response.data, `paypro-activity-${new Date().toISOString().slice(0, 10)}.csv`);
        } catch (caught) {
            toast.error(getErrorMessage(caught, 'Could not export your activity.'));
        } finally {
            setExporting(false);
        }
    };

    const transactions = accumulated;
    const groups = groupByDay(transactions);
    const totalPages = data?.totalPages ?? 1;
    const hasMore = page < totalPages;
    // Sort order is a view preference, not a filter — it never changes which
    // rows match, so it's deliberately left out of this (and out of "Clear
    // filters", below).
    const isFiltered =
        filter !== DEFAULT_TRANSACTION_FILTER || Boolean(search) || Boolean(category) || range !== DEFAULT_DATE_RANGE;
    const isInitialLoad = loading && page === 1;

    /**
     * Live rows.
     *
     * This list is a query result, not context state, so the socket updates
     * that keep the home screen's balance current never reached it — money
     * could arrive while the user was looking straight at their history, and
     * the history would not show it until something refetched.
     *
     * Only the unfiltered first page is patched in place. A row that arrives
     * while a filter or a search is active may not belong in the current result
     * at all, and inserting it anyway would show a list that contradicts its own
     * filter; those views keep the server's answer.
     */
    useEffect(() => {
        if (!subscribe || page !== 1 || isFiltered) return undefined;

        return subscribe((event, payload) => {
            const transaction = payload?.transaction;
            if (event !== 'wallet_update' || !transaction) return;

            setAccumulated((current) =>
                current.some((item) => item._id === transaction._id)
                    ? current
                    : [transaction, ...current]
            );
        });
    }, [subscribe, page, isFiltered]);

    return (
        <>
            <PageHeader
                title="Activity"
                action={
                    <div className="flex items-center gap-2">
                        <IconButton
                            label="Refresh activity"
                            size="sm"
                            onClick={handleRefresh}
                            disabled={loading || refreshing}
                        >
                            <RefreshCw size={15} className={refreshing ? 'animate-spin' : undefined} />
                        </IconButton>
                        <Button
                            variant="secondary"
                            size="sm"
                            icon={<Download size={15} />}
                            loading={exporting}
                            onClick={exportCsv}
                        >
                            <span className="hidden sm:inline">Export</span>
                        </Button>
                    </div>
                }
            />

            <div className="mb-4 space-y-3">
                <div className="relative">
                    <Search
                        size={16}
                        aria-hidden="true"
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                    />
                    <Input
                        type="search"
                        value={searchInput}
                        onChange={(event) => updateParams({ q: event.target.value })}
                        placeholder="Search by description or reference"
                        aria-label="Search activity"
                        className="pl-9"
                    />
                </div>

                <SegmentedControl
                    label="Filter activity"
                    options={TRANSACTION_FILTERS}
                    value={filter}
                    onChange={(value) => updateParams({ filter: value === DEFAULT_TRANSACTION_FILTER ? null : value })}
                />

                <div className="flex flex-wrap items-center gap-2">
                    <div className="w-36 shrink-0">
                        <Select
                            aria-label="Date range"
                            value={range}
                            onChange={(event) =>
                                updateParams({
                                    range: event.target.value === DEFAULT_DATE_RANGE ? null : event.target.value,
                                })
                            }
                        >
                            {DATE_RANGES.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </Select>
                    </div>

                    <IconButton
                        label={
                            sortOrder === 'asc'
                                ? 'Sorted oldest first — switch to newest first'
                                : 'Sorted newest first — switch to oldest first'
                        }
                        variant={sortOrder === 'asc' ? 'secondary' : 'ghost'}
                        onClick={() => updateParams({ sort: sortOrder === 'asc' ? null : 'asc' })}
                        className="shrink-0"
                    >
                        <ArrowUpDown size={16} />
                    </IconButton>

                    {category && (
                        <span className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface-sunken py-1 pl-3 pr-1.5 text-xs font-medium text-text">
                            Category: {category}
                            <button
                                type="button"
                                onClick={() => updateParams({ category: null })}
                                aria-label={`Clear ${category} category filter`}
                                className="grid h-5 w-5 place-items-center rounded-full text-text-muted hover:bg-surface-active hover:text-text"
                            >
                                <X size={12} />
                            </button>
                        </span>
                    )}
                </div>
            </div>

            <Card padding="sm">
                {isInitialLoad ? (
                    <SkeletonRows count={6} />
                ) : error ? (
                    <ErrorState
                        title="Could not load your activity"
                        message={error}
                        onRetry={retry}
                    />
                ) : transactions.length === 0 ? (
                    <EmptyState
                        variant={isFiltered ? 'no-results' : 'first-run'}
                        icon={isFiltered ? <SearchX size={20} /> : <Receipt size={20} />}
                        title={isFiltered ? 'No matching activity' : 'No activity yet'}
                        description={
                            isFiltered
                                ? 'Nothing here matches those filters. Your other transactions are still there.'
                                : 'Money you send, receive or add will show up here.'
                        }
                        action={
                            isFiltered ? (
                                <Button
                                    variant="secondary"
                                    onClick={() => updateParams({ filter: null, q: null, category: null, range: null })}
                                >
                                    Clear filters
                                </Button>
                            ) : null
                        }
                    />
                ) : (
                    <>
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

                        {hasMore && (
                            <div className="p-3">
                                <Button
                                    variant="secondary"
                                    fullWidth
                                    loading={loading}
                                    onClick={() => setPage((current) => current + 1)}
                                >
                                    Load more
                                </Button>
                            </div>
                        )}

                        {/* Announces the growing result count without stealing
                            focus, so a screen reader user knows the list
                            extended rather than silently changing. */}
                        <p aria-live="polite" className="sr-only">
                            Showing {transactions.length} transactions
                        </p>
                    </>
                )}
            </Card>

            <TransactionDetailSheet
                transaction={selected}
                open={Boolean(selected)}
                onClose={() => setSelected(null)}
            />
        </>
    );
};

export default Activity;
