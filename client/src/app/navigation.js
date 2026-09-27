import {
    Home, ArrowLeftRight, Receipt, User,
    LayoutDashboard, ShieldAlert, LifeBuoy, Users, Scale, Webhook, ScrollText, Search, CreditCard,
    BadgeCheck, Radar, Landmark,
} from 'lucide-react';
import { ROUTES } from '../constants/routes';
import { can } from '../constants/admin';

/**
 * The navigation model, defined once and consumed by both the desktop sidebar
 * and the mobile tab bar.
 *
 * Previously the sidebar owned its own array of links and the mobile experience
 * had none at all — the desktop sidebar was `fixed w-64` at every breakpoint,
 * so on a phone it covered two thirds of the screen and the content sat behind
 * a permanent `ml-64` offset that pushed it off the right edge. The app was, in
 * practice, unusable on the device most people bank on.
 */
export const PRIMARY_NAV = [
    {
        label: 'Home',
        to: ROUTES.HOME,
        icon: Home,
        /** Matches child routes too, so /home stays lit on any sub-page. */
        match: [ROUTES.HOME],
    },
    {
        label: 'Money',
        to: ROUTES.MONEY,
        icon: ArrowLeftRight,
        match: [ROUTES.MONEY, ROUTES.SEND, ROUTES.ADD_MONEY, ROUTES.WITHDRAW],
    },
    {
        label: 'Activity',
        to: ROUTES.ACTIVITY,
        icon: Receipt,
        match: [ROUTES.ACTIVITY, ROUTES.ACTIVITY_MANUAL_ENTRY],
    },
    {
        label: 'Account',
        to: ROUTES.ACCOUNT,
        icon: User,
        // The console is entered from Account on mobile, so that tab stays lit there.
        match: [ROUTES.ACCOUNT, ROUTES.SECURITY, ROUTES.ADMIN],
    },
];

/**
 * The operations console's sections (plan.md §28.4).
 *
 * Data-driven like PRIMARY_NAV rather than a second shell: the console renders
 * inside the same AppShell, and each entry names the capability it needs so a
 * role only sees sections it can actually use. Order is by urgency — the two
 * queues where a customer is waiting on a person come first.
 */
export const ADMIN_NAV = [
    { label: 'Overview', to: ROUTES.ADMIN, icon: LayoutDashboard, capability: 'viewMetrics', exact: true },
    { label: 'Risk queue', to: ROUTES.ADMIN_RISK, icon: ShieldAlert, capability: 'reviewRisk' },
    { label: 'Support', to: ROUTES.ADMIN_SUPPORT, icon: LifeBuoy, capability: 'workSupport' },
    // Phase 5: queues where a customer waits on a person, so they sit with the other queues.
    { label: 'Withdrawals', to: ROUTES.ADMIN_WITHDRAWALS, icon: Landmark, capability: 'processWithdrawals' },
    { label: 'Identity checks', to: ROUTES.ADMIN_KYC, icon: BadgeCheck, capability: 'reviewKyc' },
    { label: 'AML alerts', to: ROUTES.ADMIN_AML, icon: Radar, capability: 'viewAml' },
    { label: 'Users', to: ROUTES.ADMIN_USERS, icon: Users, capability: 'viewUsers' },
    { label: 'Transactions', to: ROUTES.ADMIN_TRANSACTIONS, icon: Search, capability: 'searchTransactions' },
    { label: 'Payments', to: ROUTES.ADMIN_PAYMENTS, icon: CreditCard, capability: 'viewPayments' },
    { label: 'Reconciliation', to: ROUTES.ADMIN_RECONCILIATION, icon: Scale, capability: 'viewReconciliation' },
    { label: 'Webhooks', to: ROUTES.ADMIN_WEBHOOKS, icon: Webhook, capability: 'viewWebhooks' },
    { label: 'Audit log', to: ROUTES.ADMIN_AUDIT, icon: ScrollText, capability: 'viewAuditLog' },
];

/** The console sections a role may see, in order. Empty for a customer. */
export const adminNavFor = (role) => ADMIN_NAV.filter((item) => can(role, item.capability));

export const isAdminNavItemActive = (item, pathname) =>
    item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);

/**
 * Returns true when `pathname` belongs to a nav item.
 *
 * `startsWith` alone is wrong here: `/money` would match `/moneybox`. Matching
 * on an exact hit or a `/`-delimited prefix avoids that.
 */
export const isNavItemActive = (item, pathname) =>
    item.match.some((path) => pathname === path || pathname.startsWith(`${path}/`));
