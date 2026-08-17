import React, { useState } from 'react';
import { Search, UserX } from 'lucide-react';
import Avatar from '../../components/ui/Avatar';
import { Input } from '../../components/ui/Field';
import { SkeletonRows } from '../../components/ui/Skeleton';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import useQuery from '../../hooks/useQuery';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { userApi } from '../../services/api/endpoints/userApi';
import cn from '../../lib/cn';

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
                                                'transition-colors duration-[--duration-fast]',
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
