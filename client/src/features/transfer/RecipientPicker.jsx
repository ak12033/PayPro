import React, { useState } from 'react';
import { Search, UserX } from 'lucide-react';
import Avatar from '../../components/ui/Avatar';
import { Input } from '../../components/ui/Field';
import Skeleton, { SkeletonRows } from '../../components/ui/Skeleton';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import useQuery from '../../hooks/useQuery';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { userApi } from '../../services/api/endpoints/userApi';
import { transactionApi } from '../../services/api/endpoints/transactionApi';
import cn from '../../lib/cn';

/**
 * "Send again" shortcuts.
 *
 * A horizontal strip of the last few people paid, above the search box, so the
 * common case — paying someone you already pay — is one tap instead of typing
 * a name you have typed before.
 *
 * It hides itself while a search is active: once the user is searching, the
 * shortcuts are answering a question they have moved on from, and leaving them
 * on screen pushes the actual results below the fold on a phone.
 *
 * A failure here is silent by design. This is a convenience layer over a
 * search box that still works perfectly without it, so an error state would be
 * alarming the user about something that has not blocked them.
 */
const RecentRecipients = ({ value, onChange }) => {
    const { data, loading, error } = useQuery(
        async () => (await transactionApi.getRecentRecipients()).data,
        { deps: [] }
    );

    const recipients = data?.recipients ?? [];

    if (loading) {
        return (
            <div className="mb-3 flex gap-3" aria-hidden="true">
                {/* Sized to match the real row exactly — `Avatar size="md"` is
                    h-10 w-10 — so resolving the fetch swaps content in without
                    nudging the search box below it. */}
                {[0, 1, 2].map((i) => (
                    <div key={i} className="flex w-[4.5rem] flex-col items-center gap-1.5 px-1 py-2">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <Skeleton className="h-2.5 w-12" />
                    </div>
                ))}
            </div>
        );
    }

    if (error || recipients.length === 0) return null;

    return (
        <div className="mb-4">
            <p id="recent-recipients-label" className="mb-2 text-2xs uppercase text-text-muted">
                Send again
            </p>
            {/* Horizontally scrollable so four-plus shortcuts never wrap into a
                second row that pushes the search box off a small screen. */}
            <ul
                aria-labelledby="recent-recipients-label"
                className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
            >
                {recipients.map((user) => {
                    const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
                    const selected = value?._id === user._id;

                    return (
                        <li key={user._id}>
                            <button
                                type="button"
                                aria-pressed={selected}
                                onClick={() => onChange(user)}
                                className={cn(
                                    'flex w-[4.5rem] flex-col items-center gap-1.5 rounded-card px-1 py-2',
                                    'transition-colors duration-(--duration-fast)',
                                    selected ? 'bg-accent-soft' : 'hover:bg-surface-hover'
                                )}
                            >
                                <Avatar name={name} size="md" />
                                <span className="w-full truncate text-center text-2xs text-text-secondary">
                                    {user.firstName || 'User'}
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};

/**
 * Choosing who to pay.
 *
 * The old picker was a custom dropdown that fetched `/users/all` once and then
 * filtered the result in the browser. That endpoint is paginated and defaults
 * to 25 users — so the filter only ever searched the first 25 people in the
 * directory, alphabetically. Typing the name of anyone outside that window
 * returned "no results" for a recipient who demonstrably existed, and there was
 * no way for the user to tell the difference between "this person is not on
 * PayPro" and "this person is on page two".
 *
 * Search is now the server's job, which is where it belonged: the API already
 * accepts `?search=` and does the matching against the full collection.
 *
 * It is also a plain, always-visible list rather than a dropdown. A dropdown
 * hides the most important decision in the flow behind a click, and on mobile
 * an absolutely-positioned menu over a form is exactly the pattern that ends up
 * clipped or scrolled off-screen.
 */
const RecipientPicker = ({ value, onChange }) => {
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebouncedValue(search);

    const { data, loading, error, retry } = useQuery(
        async () => (await userApi.search({ search: debouncedSearch })).data,
        { deps: [debouncedSearch] }
    );

    const users = data?.users ?? [];
    const hasQuery = debouncedSearch.trim().length > 0;

    return (
        <div>
            {/* Keyed off the raw input rather than `hasQuery`'s debounced
                value, so the strip disappears on the first keystroke instead
                of a beat later — which would shift the results list down at
                the exact moment they arrive. */}
            {search.trim().length === 0 && (
                <RecentRecipients value={value} onChange={onChange} />
            )}

            <div className="relative">
                <Search
                    size={16}
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                />
                <Input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search by name"
                    aria-label="Search for a recipient"
                    className="pl-9"
                />
            </div>

            <div
                className="mt-2 max-h-72 overflow-y-auto"
                // The list updates as the user types; announcing each change
                // assertively would talk over them, so it is polite and the
                // count is announced rather than every row.
                aria-live="polite"
                aria-busy={loading}
            >
                {loading ? (
                    <SkeletonRows count={3} />
                ) : error ? (
                    <ErrorState
                        title="Could not load recipients"
                        message={error}
                        reassurance={null}
                        onRetry={retry}
                    />
                ) : users.length === 0 ? (
                    <EmptyState
                        variant={hasQuery ? 'no-results' : 'first-run'}
                        icon={<UserX size={18} />}
                        title={hasQuery ? 'No one matched' : 'No recipients yet'}
                        description={
                            hasQuery
                                ? `We couldn't find anyone called "${debouncedSearch}". Check the spelling, or ask them to sign up for PayPro.`
                                : 'People you can send money to will appear here.'
                        }
                    />
                ) : (
                    <>
                        <p className="sr-only">{users.length} recipients found</p>
                        <ul
                            role="radiogroup"
                            aria-label="Recipient"
                            className="divide-y divide-border"
                        >
                            {users.map((user) => {
                                const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
                                const selected = value?._id === user._id;

                                return (
                                    <li key={user._id}>
                                        <button
                                            type="button"
                                            role="radio"
                                            aria-checked={selected}
                                            onClick={() => onChange(user)}
                                            className={cn(
                                                'flex min-h-14 w-full items-center gap-3 rounded-control px-2 text-left',
                                                'transition-colors duration-(--duration-fast)',
                                                selected
                                                    ? 'bg-accent-soft'
                                                    : 'hover:bg-surface-hover'
                                            )}
                                        >
                                            <Avatar name={name} size="md" />
                                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">
                                                {name || 'PayPro user'}
                                            </span>
                                            {/* A check, not just a background
                                                tint — selection must survive
                                                without colour. */}
                                            <span
                                                aria-hidden="true"
                                                className={cn(
                                                    'grid h-5 w-5 shrink-0 place-items-center rounded-full border',
                                                    selected
                                                        ? 'border-accent bg-accent text-on-accent'
                                                        : 'border-border-strong'
                                                )}
                                            >
                                                {selected && (
                                                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                                                )}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </>
                )}
            </div>
        </div>
    );
};

export default RecipientPicker;
