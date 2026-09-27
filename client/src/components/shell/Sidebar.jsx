import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Sparkles, ShieldCheck, Plus } from 'lucide-react';
import cn from '../../lib/cn';
import { PRIMARY_NAV, isNavItemActive, adminNavFor, isAdminNavItemActive } from '../../app/navigation';
import { useAuth } from '../../context/AuthContext';
import { ROUTES } from '../../constants/routes';
import { APP_NAME } from '../../constants/app';
import Button from '../ui/Button';

/**
 * Desktop primary navigation.
 *
 * Deliberately the *same four destinations* as the mobile tab bar, in the same
 * order. The previous sidebar showed six links grouped into "Core" and
 * "Activity", which meant the desktop and mobile mental models would have
 * diverged the moment mobile navigation existed — and a user who learned the
 * product on their phone would have had to relearn it on a laptop.
 *
 * The extra vertical space desktop affords is spent on *secondary* entries
 * (Insights, Security) and on the primary action, not on flattening more
 * destinations into the top level.
 */
const Sidebar = () => {
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const { user } = useAuth();
    // Empty for a customer, so the whole group simply does not render.
    const operations = adminNavFor(user?.role);

    /*
     * The aside is pinned to the viewport while the page scrolls.
     *
     * `sticky` rather than `fixed`: the sidebar is a flex sibling of the content
     * column, so sticky keeps its 15rem box in the flow and the content column
     * keeps sizing itself off it. A fixed sidebar would be removed from the flow
     * and the content column would then need a matching left offset — two
     * numbers to keep in sync, and the usual source of a stray horizontal
     * scrollbar when they drift apart.
     *
     * `h-dvh` overrides the flex stretch that would otherwise make this as tall
     * as the whole document; `overflow-y-auto` only shows a scrollbar if the
     * links ever outgrow the viewport, which today they do not.
     */
    return (
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 overflow-y-auto border-r border-border bg-surface/95 backdrop-blur-md lg:flex lg:flex-col">
            <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
                <span
                    aria-hidden="true"
                    className="grid h-8 w-8 place-items-center rounded-control bg-gradient-brand text-on-accent"
                >
                    <Sparkles size={17} />
                </span>
                <span className="text-base font-semibold tracking-tight text-text">{APP_NAME}</span>
            </div>

            {/* The primary action lives in the navigation on desktop, where
                there is room for it, so "add money" is reachable from every
                screen without first navigating to the wallet. */}
            <div className="shrink-0 px-3 pb-4">
                {/* A button that navigates, not a <button> nested in an <a> —
                    which is invalid markup and gives assistive tech two
                    conflicting controls in the same place. */}
                <Button
                    variant="primary"
                    fullWidth
                    icon={<Plus size={16} />}
                    onClick={() => navigate(ROUTES.ADD_MONEY)}
                >
                    Add money
                </Button>
            </div>

            <nav aria-label="Primary" className="shrink-0 px-3">
                <ul className="space-y-0.5">
                    {PRIMARY_NAV.map((item) => {
                        const active = isNavItemActive(item, pathname);
                        const Icon = item.icon;

                        return (
                            <li key={item.to}>
                                <Link
                                    to={item.to}
                                    aria-current={active ? 'page' : undefined}
                                    className={cn(
                                        'flex h-10 items-center gap-3 rounded-control px-3 text-sm font-medium',
                                        'transition-colors duration-[--duration-fast]',
                                        active
                                            ? 'bg-accent-soft text-accent-text ring-1 ring-accent/20'
                                            : 'text-text-secondary hover:bg-surface-hover hover:text-text'
                                    )}
                                >
                                    <Icon size={18} aria-hidden="true" />
                                    {item.label}
                                </Link>
                            </li>
                        );
                    })}
                </ul>

                <p className="mt-6 px-3 pb-2 text-2xs font-medium uppercase text-text-muted">
                    More
                </p>

                <ul className="space-y-0.5">
                    <SecondaryLink
                        to={ROUTES.INSIGHTS}
                        icon={Sparkles}
                        label="Insights"
                        active={pathname.startsWith(ROUTES.INSIGHTS)}
                    />
                    <SecondaryLink
                        to={ROUTES.SECURITY}
                        icon={ShieldCheck}
                        label="Security"
                        active={pathname.startsWith(ROUTES.SECURITY)}
                    />
                </ul>

                {/*
                 * Staff only (plan.md §28.4). Below the customer's own links,
                 * never mixed into them: a support agent is also a PayPro
                 * customer, and their wallet must not become harder to find
                 * because they have a job here.
                 */}
                {operations.length > 0 && (
                    <>
                        <p className="mt-6 px-3 pb-2 text-2xs font-medium uppercase text-text-muted">
                            Operations
                        </p>
                        <ul className="space-y-0.5 pb-4">
                            {operations.map((item) => (
                                <SecondaryLink
                                    key={item.to}
                                    to={item.to}
                                    icon={item.icon}
                                    label={item.label}
                                    active={isAdminNavItemActive(item, pathname)}
                                />
                            ))}
                        </ul>
                    </>
                )}
            </nav>
        </aside>
    );
};

const SecondaryLink = ({ to, icon: Icon, label, active }) => (
    <li>
        <Link
            to={to}
            aria-current={active ? 'page' : undefined}
            className={cn(
                'flex h-10 items-center gap-3 rounded-control px-3 text-sm',
                'transition-colors duration-[--duration-fast]',
                active
                    ? 'bg-accent-soft font-medium text-accent-text'
                    : 'text-text-secondary hover:bg-surface-hover hover:text-text'
            )}
        >
            <Icon size={18} aria-hidden="true" />
            {label}
        </Link>
    </li>
);

export default Sidebar;
