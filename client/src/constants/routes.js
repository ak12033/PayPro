/**
 * The route map.
 *
 * This is the redesigned information architecture, written down. The previous
 * one had seven authenticated destinations in a flat list, and the grouping was
 * accidental — "Core" and "Activity" in the sidebar were labels applied after
 * the fact to whichever pages happened to exist.
 *
 * The new structure is organised around the four questions a person actually
 * opens a money app to answer:
 *
 *   HOME     — "how much do I have, and what just happened?"
 *   MONEY    — "move some."               (send / add, one destination)
 *   ACTIVITY — "what happened before?"    (one ledger, not two)
 *   ACCOUNT  — "is this safe, and is it set up how I want?"
 *
 * Four primary destinations is not an arbitrary number: it is the most that
 * fits a mobile tab bar without labels truncating, and every additional one
 * makes the other three harder to find.
 *
 * Consolidations, and why:
 *
 *   /transactions + /payment-history -> /activity
 *     Two ledgers describing the same money. A user who topped up ₹500 saw it
 *     in both, with different columns and different date formats, and had no
 *     way to know which was authoritative. Top-ups are now a *source filter*
 *     on one ledger.
 *
 *   /p2p-transfer + /add-money -> /money/send + /money/add
 *     Kept as separate flows (they genuinely differ) but grouped under one nav
 *     destination, because "move money" is one intent and the choice between
 *     them belongs inside the flow, not in the navigation.
 *
 *   /update-profile -> /account
 *     Profile was a top-level destination competing with the wallet. It is a
 *     settings concern.
 *
 *   /add-transaction -> removed from navigation. See ACTIVITY_MANUAL_ENTRY.
 */
export const ROUTES = {
    // ---- public
    /** Splash: plays the launch sequence, then routes to Home or Login. */
    LANDING: '/',
    WELCOME: '/welcome',
    LOGIN: '/login',
    SIGNUP: '/signup',
    LOGIN_2FA: '/verify-login-otp',
    FORGOT_PASSWORD: '/forgot-password',
    RESET_PASSWORD: '/reset-password',

    // ---- authenticated, full-screen (no shell: these are focused flows)
    TRANSFER_2FA: '/verify-otp',

    // ---- primary destinations
    HOME: '/home',
    MONEY: '/money',
    SEND: '/money/send',
    ADD_MONEY: '/money/add',
    /** Phase 5: to the holder's own verified bank account (plan.md §0.20.3). */
    WITHDRAW: '/money/withdraw',
    ACTIVITY: '/activity',
    ACCOUNT: '/account',

    // ---- secondary, reached from a primary destination
    INSIGHTS: '/insights',
    SECURITY: '/account/security',
    NOTIFICATIONS: '/notifications',
    BUDGETS: '/insights/budgets',
    GOALS: '/insights/goals',
    /**
     * Bills and detected repeat payments share one destination: they are two
     * views of "this money goes out regularly", and splitting them would make
     * a user check two screens to answer one question (plan.md §18.3, §19.2).
     */
    BILLS: '/insights/bills',
    TOOLS: '/insights/tools',
    SUPPORT: '/account/support',
    /** Phase 5: identity verification (plan.md §0.20.2). Notifications of type Account land here. */
    VERIFICATION: '/account/verification',
    /** Phase 5: self-reported holdings and debts (plan.md §21, §22). */
    PORTFOLIO: '/insights/portfolio',

    /**
     * Manual ledger entry.
     *
     * Deliberately unlinked from navigation. It lets a user write a row into
     * their own transaction history that corresponds to no movement of money —
     * which, in a product that also shows a real wallet balance, means the
     * ledger and the balance can disagree and the user cannot tell which is
     * lying. It stays routable so existing links and bookmarks do not 404, but
     * it is not a destination. The recommendation is to remove it.
     */
    ACTIVITY_MANUAL_ENTRY: '/activity/record',

    /**
     * The operations console (plan.md §28.4). Staff-only, and reached from the
     * sidebar's "Operations" group or the Account screen — never a fifth tab.
     * The customer's four destinations stay exactly as they are for staff too.
     */
    ADMIN: '/admin',
    ADMIN_RISK: '/admin/risk',
    ADMIN_SUPPORT: '/admin/support',
    ADMIN_USERS: '/admin/users',
    ADMIN_TRANSACTIONS: '/admin/transactions',
    ADMIN_PAYMENTS: '/admin/payments',
    ADMIN_RECONCILIATION: '/admin/reconciliation',
    ADMIN_WEBHOOKS: '/admin/webhooks',
    ADMIN_AUDIT: '/admin/audit',
    ADMIN_KYC: '/admin/kyc',
    ADMIN_AML: '/admin/aml',
    ADMIN_WITHDRAWALS: '/admin/withdrawals',

    NOT_FOUND: '*',
};

/** Paths a signed-out visitor is allowed to sit on. */
export const PUBLIC_ROUTES = [
    ROUTES.LANDING,
    ROUTES.WELCOME,
    ROUTES.LOGIN,
    ROUTES.SIGNUP,
    ROUTES.LOGIN_2FA,
    ROUTES.TRANSFER_2FA,
    ROUTES.FORGOT_PASSWORD,
    ROUTES.RESET_PASSWORD,
];

/**
 * Where a signed-in user lands.
 *
 * Named rather than repeated as a literal, because "the home screen" moved in
 * this redesign and there were nine places that hard-coded `/dashboard`.
 */
export const HOME_ROUTE = ROUTES.HOME;

/**
 * Paths that existed before the redesign, mapped to their replacement.
 *
 * Consumed by redirect routes in App.jsx. A user with `/dashboard` bookmarked,
 * or a push notification linking to `/payment-history`, must not hit a 404
 * because we reorganised the navigation.
 */
export const LEGACY_REDIRECTS = {
    '/dashboard': ROUTES.HOME,
    '/p2p-transfer': ROUTES.SEND,
    '/add-money': ROUTES.ADD_MONEY,
    '/transactions': ROUTES.ACTIVITY,
    '/payment-history': `${ROUTES.ACTIVITY}?source=topup`,
    '/add-transaction': ROUTES.ACTIVITY_MANUAL_ENTRY,
    '/update-profile': ROUTES.ACCOUNT,
    '/settings': ROUTES.ACCOUNT,
};
