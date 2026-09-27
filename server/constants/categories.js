/**
 * The one canonical category list.
 *
 * Previously there were three: 12 hardcoded on the server for manual entry, 19
 * in the FastAPI categorisation prompt, and 6 on the client. The AI could
 * return "Healthcare" while the manual form only offered "Health"; the client
 * couldn't render "Groceries" or "Rent" at all. This list merges all three sets
 * so nothing already stored in the database becomes an orphaned value, and it
 * is now the *only* place a category name is spelled out — the server, the
 * AI prompt and the client all read from (or are validated against) this file.
 *
 * `ledgerService` also writes a handful of system categories itself
 * ('Transfer', 'Top Up', 'Refund') — those are intentionally not user-pickable
 * and are listed separately below so a correction can never reassign a P2P
 * transfer into a spending category.
 */
export const CATEGORIES = [
    { name: 'General', icon: 'CircleDollarSign' },
    { name: 'Food', icon: 'Utensils' },
    { name: 'Groceries', icon: 'ShoppingCart' },
    { name: 'Transport', icon: 'Car' },
    { name: 'Bills', icon: 'Receipt' },
    { name: 'Internet', icon: 'Wifi' },
    { name: 'Shopping', icon: 'ShoppingBag' },
    { name: 'Health', icon: 'HeartPulse' },
    { name: 'Healthcare', icon: 'HeartPulse' },
    { name: 'Entertainment', icon: 'Tv' },
    { name: 'Education', icon: 'GraduationCap' },
    { name: 'Rent', icon: 'Home' },
    { name: 'Travel', icon: 'Plane' },
    { name: 'Insurance', icon: 'Shield' },
    { name: 'Subscription', icon: 'Tv' },
    { name: 'Investment', icon: 'PiggyBank' },
    { name: 'Savings', icon: 'PiggyBank' },
    { name: 'Loan', icon: 'Briefcase' },
    { name: 'Gift', icon: 'Gift' },
    { name: 'Donation', icon: 'Gift' },
    { name: 'P2P', icon: 'Send' },
    { name: 'Others', icon: 'CircleDollarSign' },
    /**
     * Income-side categories, added for plan.md §16 cash-flow classification
     * (Phase 3). The list above was entirely expense-shaped — a manual entry
     * describing salary or freelance income had nowhere honest to point.
     * Appended, not inserted, so no existing stored category name shifts.
     */
    { name: 'Salary', icon: 'Briefcase' },
    { name: 'Freelance', icon: 'PenLine' },
    { name: 'Business Income', icon: 'Briefcase' },
    { name: 'Interest & Investment Income', icon: 'TrendingUp' },
    { name: 'Other Income', icon: 'CircleDollarSign' },
];

export const CATEGORY_NAMES = CATEGORIES.map((c) => c.name);

export const CATEGORY_ICON_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.name, c.icon]));

export const DEFAULT_CATEGORY = 'Others';
export const DEFAULT_CATEGORY_ICON = CATEGORY_ICON_MAP[DEFAULT_CATEGORY];

/**
 * Written by the ledger itself for money movement that is not "spending" in
 * the category-budget sense. Never offered on the manual-entry form and never
 * a valid target for a user correction — see categoryService.canRecategorise.
 */
export const SYSTEM_CATEGORIES = ['Transfer', 'Top Up', 'Refund', 'Stripe', 'Adjustment', 'Withdrawal'];

/**
 * Cash-flow classification (plan.md §16.1) and budget exclusion (§13.2),
 * keyed by the same category names above rather than a slug — this list is
 * name-based, not the slug-based shape plan.md originally sketched, because
 * that's what Phase 1 actually shipped everywhere (Transaction.category,
 * SYSTEM_CATEGORIES, categoryService, the client). Adding a slug layer now
 * would be a Phase-1 redo with no Phase-3 requirement forcing it.
 *
 * `group` drives cash-flow's fixed/variable/savings buckets; `kind` marks
 * whether a category represents money earned ('income'), spent ('expense'),
 * or both ('both', for things like investment interest that can appear as
 * either a debit or a credit depending on direction).
 */
export const CATEGORY_META = {
    General: { group: 'other', kind: 'expense' },
    Food: { group: 'living', kind: 'expense' },
    Groceries: { group: 'living', kind: 'expense' },
    Transport: { group: 'living', kind: 'expense' },
    Bills: { group: 'fixed', kind: 'expense' },
    Internet: { group: 'fixed', kind: 'expense' },
    Shopping: { group: 'lifestyle', kind: 'expense' },
    Health: { group: 'living', kind: 'expense' },
    Healthcare: { group: 'living', kind: 'expense' },
    Entertainment: { group: 'lifestyle', kind: 'expense' },
    Education: { group: 'fixed', kind: 'expense' },
    Rent: { group: 'fixed', kind: 'expense' },
    Travel: { group: 'lifestyle', kind: 'expense' },
    Insurance: { group: 'fixed', kind: 'expense' },
    Subscription: { group: 'fixed', kind: 'expense' },
    Investment: { group: 'savings', kind: 'expense' },
    Savings: { group: 'savings', kind: 'expense' },
    Loan: { group: 'fixed', kind: 'expense' },
    Gift: { group: 'lifestyle', kind: 'expense' },
    Donation: { group: 'lifestyle', kind: 'expense' },
    P2P: { group: 'other', kind: 'expense' },
    Others: { group: 'other', kind: 'expense' },
    Salary: { group: 'income', kind: 'income' },
    Freelance: { group: 'income', kind: 'income' },
    'Business Income': { group: 'income', kind: 'income' },
    'Interest & Investment Income': { group: 'savings', kind: 'both' },
    'Other Income': { group: 'income', kind: 'income' },
    // System categories, for completeness — never user-facing spend/income.
    Transfer: { group: 'other', kind: 'expense' },
    'Top Up': { group: 'other', kind: 'transfer' },
    Refund: { group: 'other', kind: 'transfer' },
    Stripe: { group: 'other', kind: 'transfer' },
    /**
     * Written only by `ledgerService.applyAdjustment` and
     * `reconciliationService.repairAccountBalance` (plan.md §28.2, §29.3) — an
     * operator's correction, never something the user earned or spent.
     */
    Adjustment: { group: 'other', kind: 'transfer' },
    /**
     * Money moved to the holder's own bank account (Phase 5,
     * `withdrawalService`). Their own money changing place, not spending.
     */
    Withdrawal: { group: 'other', kind: 'transfer' },
};

/** Safe fallback so a legacy or unmapped category name never throws. */
export const categoryGroup = (name) => CATEGORY_META[name]?.group ?? 'other';
export const categoryKind = (name) => CATEGORY_META[name]?.kind ?? 'expense';

/**
 * Debit rows excluded from budget spend (plan.md §13.2): a refund reverses a
 * previous debit rather than describing new spending, and 'Stripe' is dead
 * legacy data (plan.md §4.14/§0.1), and an 'Adjustment' is an operator's
 * correction rather than anything the user bought. 'Top Up' is a Credit in practice and would
 * never reach a Debit-only query, but is listed for defensiveness against any
 * future write path that doesn't hold that invariant.
 */
export const EXCLUDED_FROM_BUDGET = ['Top Up', 'Refund', 'Stripe', 'Adjustment', 'Withdrawal'];
