import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import cn from '../../lib/cn';
import { useAuth } from '../../context/AuthContext';
import { adminNavFor, isAdminNavItemActive } from '../../app/navigation';
import { ROLE_LABEL } from '../../constants/admin';
import { ROUTES } from '../../constants/routes';
import Card from '../../components/ui/Card';

/**
 * Frame for every `/admin/*` screen.
 *
 * A section strip rather than a second sidebar (plan.md §28.4: "an admin
 * variant of Sidebar ... rather than a second shell"). On desktop the main
 * sidebar also lists these sections; on a phone this strip is the only
 * console navigation, so it scrolls horizontally instead of wrapping — the
 * same rule SegmentedControl follows, for the same reason.
 *
 * Real links, not a tablist: each section is its own URL that can be
 * bookmarked, shared with a colleague, and opened in a new tab mid-shift.
 */
const AdminLayout = () => {
    const { pathname } = useLocation();
    const { user } = useAuth();
    const sections = adminNavFor(user?.role);

    return (
        <>
            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                <span className="rounded-pill bg-warning-soft px-2 py-0.5 font-medium text-warning">
                    Operations console
                </span>
                <span>
                    Signed in as {ROLE_LABEL[user?.role] ?? user?.role}. Every action here is audit-logged.
                </span>
            </div>

            <nav aria-label="Console sections" className="mb-5">
                <ul
                    className={cn(
                        'flex gap-1 overflow-x-auto rounded-control bg-surface-sunken p-1',
                        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
                    )}
                >
                    {sections.map((item) => {
                        const active = isAdminNavItemActive(item, pathname);
                        const Icon = item.icon;
                        return (
                            <li key={item.to} className="shrink-0">
                                <Link
                                    to={item.to}
                                    aria-current={active ? 'page' : undefined}
                                    className={cn(
                                        'flex h-9 items-center gap-2 rounded-[calc(var(--radius-control)-2px)] px-3 text-sm font-medium',
                                        'transition-colors duration-[--duration-fast]',
                                        active
                                            ? 'bg-surface text-accent-text shadow-raised'
                                            : 'text-text-muted hover:text-text'
                                    )}
                                >
                                    <Icon size={15} aria-hidden="true" />
                                    {item.label}
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </nav>

            {/* Mandatory staff 2FA (plan.md §28.3 rule 5). The server refuses
                every console call with TOTP_ENROLMENT_REQUIRED until this is
                done; this says so once instead of every panel failing. */}
            {user && !user.totpEnabled ? (
                <Card padding="lg" className="text-center">
                    <h1 className="text-lg font-semibold text-text">Set up an authenticator app first</h1>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-secondary">
                        Staff accounts need a code from an authenticator app to sign in, because the
                        console can act on other people&apos;s money. It takes about a minute.
                    </p>
                    <Link
                        to={`${ROUTES.ACCOUNT}?setup=authenticator`}
                        className="mt-4 inline-flex h-11 items-center rounded-control bg-gradient-brand px-5 text-sm font-medium text-on-accent"
                    >
                        Set up authenticator app
                    </Link>
                </Card>
            ) : (
                <Outlet />
            )}
        </>
    );
};

export default AdminLayout;
