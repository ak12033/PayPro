import { Home, ArrowLeftRight, Receipt, User } from 'lucide-react';
import { ROUTES } from '../constants/routes';

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
        match: [ROUTES.MONEY, ROUTES.SEND, ROUTES.ADD_MONEY],
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
        match: [ROUTES.ACCOUNT, ROUTES.SECURITY],
    },
];

/**
 * Returns true when `pathname` belongs to a nav item.
 *
 * `startsWith` alone is wrong here: `/money` would match `/moneybox`. Matching
 * on an exact hit or a `/`-delimited prefix avoids that.
 */
export const isNavItemActive = (item, pathname) =>
    item.match.some((path) => pathname === path || pathname.startsWith(`${path}/`));
