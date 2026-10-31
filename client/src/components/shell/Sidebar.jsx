import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck, Plus, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import LogoMark from '../ui/LogoMark';
import cn from '../../lib/cn';
import { PRIMARY_NAV, isNavItemActive, adminNavFor, isAdminNavItemActive } from '../../app/navigation';
import { prefetchProps } from '../../app/routePrefetch';
import { useAuth } from '../../context/AuthContext';
import { ROUTES } from '../../constants/routes';
import { APP_NAME } from '../../constants/app';
import { env } from '../../app/config/env';
import Button from '../ui/Button';

const STORAGE_KEY = 'paypro-sidebar-collapsed';

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
 *
 * Collapsible to an icon rail, for anyone who would rather give the width to
 * the charts and tables. The choice persists across visits — a preference that
 * has to be re-made on every load is not a preference. Collapsed, every label
 * stays in the accessibility tree (`sr-only`) and appears as a native tooltip,
 * so the rail loses width, not meaning.
 */
const NAV_MOTION =
    'transition-colors duration-(--duration-hover) ease-(--ease-out)';

const readCollapsed = () => {
    try {
        return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
};

const Sidebar = () => {
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const { user } = useAuth();
    // Empty for a customer, so the whole group simply does not render.
    const operations = adminNavFor(user?.role);
    const [collapsed, setCollapsed] = useState(readCollapsed);

    const toggle = () => {
        setCollapsed((prev) => {
            const next = !prev;
            try {
                localStorage.setItem(STORAGE_KEY, String(next));
            } catch {
                // Non-fatal; the toggle still works for this session.
            }
            return next;
        });
    };

    /*
     * The aside is pinned to the viewport while the page scrolls.
     *
     * `sticky` rather than `fixed`: the sidebar is a flex sibling of the content
     * column, so sticky keeps its box in the flow and the content column keeps
     * sizing itself off it — which is also what lets collapsing simply hand the
     * width to the content, with no offset to keep in sync.
     *
     * `h-dvh` overrides the flex stretch that would otherwise make this as tall
     * as the whole document; `overflow-y-auto` only shows a scrollbar if the
     * links ever outgrow the viewport.
     */
    return (
        <aside
            className={cn(
                'sticky top-0 hidden h-dvh shrink-0 overflow-y-auto overflow-x-hidden border-r border-border bg-surface/95 backdrop-blur-md lg:flex lg:flex-col',
                'transition-[width] duration-(--duration-normal) ease-(--ease-out)',
                collapsed ? 'w-[4.5rem]' : 'w-72'
            )}
        >
            {/*
             * Header, with the collapse toggle at the top where the eye starts.
             * Expanded: brand on the left, the toggle on the right. Collapsed,
             * the rail is too narrow for both, so the mark itself becomes the
             * toggle and turns into the expand icon on hover or focus.
             */}
            <div className={cn('flex h-16 shrink-0 items-center gap-2.5', collapsed ? 'justify-center px-0' : 'pl-5 pr-3')}>
                {collapsed ? (
                    <button
                        type="button"
                        onClick={toggle}
                        aria-expanded={false}
                        aria-label="Expand sidebar"
                        title="Expand sidebar"
                        className={cn('group/toggle grid h-10 w-10 place-items-center rounded-control text-text-muted hover:bg-surface-hover hover:text-text', NAV_MOTION)}
                    >
                        <LogoMark size={32} className="col-start-1 row-start-1 transition-opacity duration-(--duration-hover) group-hover/toggle:opacity-0 group-focus-visible/toggle:opacity-0" />
                        <PanelLeftOpen
                            size={18}
                            aria-hidden="true"
                            className="col-start-1 row-start-1 opacity-0 transition-opacity duration-(--duration-hover) group-hover/toggle:opacity-100 group-focus-visible/toggle:opacity-100"
                        />
                        <span className="sr-only">{APP_NAME}</span>
                    </button>
                ) : (
                    <>
                        <LogoMark size={32} />
                        <span className="text-base font-semibold tracking-tight text-text">{APP_NAME}</span>
                        <button
                            type="button"
                            onClick={toggle}
                            aria-expanded
                            aria-label="Collapse sidebar"
                            title="Collapse sidebar"
                            className={cn('ml-auto grid h-9 w-9 place-items-center rounded-control text-text-muted hover:bg-surface-hover hover:text-text', NAV_MOTION)}
                        >
                            <PanelLeftClose size={18} aria-hidden="true" />
                        </button>
                    </>
                )}
            </div>

            {/* The primary action lives in the navigation on desktop, where
                there is room for it, so "add money" is reachable from every
                screen without first navigating to the wallet. */}
            {env.consumerWalletEnabled && <div className="shrink-0 px-3 pb-4">
                {/* A button that navigates, not a <button> nested in an <a> —
                    which is invalid markup and gives assistive tech two
                    conflicting controls in the same place. */}
                <Button
                    variant="primary"
                    fullWidth
                    icon={<Plus size={16} />}
                    onClick={() => navigate(ROUTES.ADD_MONEY)}
                    title={collapsed ? 'Add money' : undefined}
                    className={cn(collapsed && 'px-0')}
                    {...prefetchProps(ROUTES.ADD_MONEY)}
                >
                    <span className={cn(collapsed && 'sr-only')}>Add money</span>
                </Button>
            </div>}

            <nav aria-label="Primary" className="shrink-0 px-3">
                <ul className="space-y-0.5">
                    {PRIMARY_NAV.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            icon={item.icon}
                            label={item.label}
                            active={isNavItemActive(item, pathname)}
                            collapsed={collapsed}
                            emphasis
                        />
                    ))}
                </ul>

                <GroupLabel collapsed={collapsed}>More</GroupLabel>

                <ul className="space-y-0.5">
                    {env.consumerWalletEnabled && (
                        <NavLink
                            to={ROUTES.INSIGHTS}
                            icon={LogoMark}
                            label="Insights"
                            active={pathname.startsWith(ROUTES.INSIGHTS)}
                            collapsed={collapsed}
                        />
                    )}
                    <NavLink
                        to={ROUTES.SECURITY}
                        icon={ShieldCheck}
                        label="Security"
                        active={pathname.startsWith(ROUTES.SECURITY)}
                        collapsed={collapsed}
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
                        <GroupLabel collapsed={collapsed}>Operations</GroupLabel>
                        <ul className="space-y-0.5 pb-4">
                            {operations.map((item) => (
                                <NavLink
                                    key={item.to}
                                    to={item.to}
                                    icon={item.icon}
                                    label={item.label}
                                    active={isAdminNavItemActive(item, pathname)}
                                    collapsed={collapsed}
                                />
                            ))}
                        </ul>
                    </>
                )}
            </nav>
        </aside>
    );
};

/** A group heading, or a hairline in its place when the rail is collapsed. */
const GroupLabel = ({ collapsed, children }) =>
    collapsed ? (
        <div className="mx-2 my-4 border-t border-border" role="presentation" />
    ) : (
        <p className="mt-6 px-3 pb-2 text-2xs font-medium uppercase text-text-muted">{children}</p>
    );

/**
 * One navigation row. `emphasis` is the primary group's treatment (medium
 * weight and a ring when active); secondary rows are lighter.
 */
const NavLink = ({ to, icon: Icon, label, active, collapsed, emphasis = false }) => (
    <li>
        <Link
            to={to}
            {...prefetchProps(to)}
            aria-current={active ? 'page' : undefined}
            title={collapsed ? label : undefined}
            className={cn(
                'group flex h-10 items-center gap-3 rounded-control text-sm',
                emphasis && 'font-medium',
                NAV_MOTION,
                collapsed ? 'justify-center px-0' : 'px-3',
                active
                    ? cn('bg-accent-soft text-accent-text', emphasis ? 'ring-1 ring-accent/20' : 'font-medium')
                    : 'text-text-secondary hover:bg-surface-hover hover:text-text'
            )}
        >
            <Icon size={18} aria-hidden="true" className="shrink-0" />
            <span className={cn('truncate', collapsed && 'sr-only')}>{label}</span>
        </Link>
    </li>
);

export default Sidebar;
