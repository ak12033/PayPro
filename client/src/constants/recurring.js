/**
 * Copy and formatting for detected recurring payments and bill reminders
 * (plan.md §18.3, §19.2).
 *
 * The wording lives here rather than inline in each component because both
 * features make a promise the product must not break: PayPro *notices* things
 * and *reminds* about things. It does not subscribe, cancel, or pay. One place
 * for that vocabulary is what stops a well-meaning edit to one screen turning
 * "looks like a recurring payment" into "your subscription".
 */

export const CADENCE_LABEL = {
    weekly: 'Weekly',
    monthly: 'Monthly',
    quarterly: 'Every 3 months',
    yearly: 'Yearly',
};

export const BILL_FREQUENCY_LABEL = {
    once: 'One-off',
    weekly: 'Weekly',
    monthly: 'Monthly',
    quarterly: 'Every 3 months',
    yearly: 'Yearly',
};

export const BILL_STATUS_TONE = {
    upcoming: 'neutral',
    overdue: 'negative',
    paid: 'positive',
    skipped: 'neutral',
};

export const BILL_STATUS_LABEL = {
    upcoming: 'Upcoming',
    overdue: 'Overdue',
    paid: 'Paid',
    skipped: 'Skipped',
};

/** The disclaimer every bill surface must carry (§19.2). */
export const BILL_DISCLAIMER =
    'Reminder only — pay this with your usual method and mark it here. PayPro does not pay bills.';

/** The framing every detection must carry (§18.3). */
export const RECURRING_DISCLAIMER =
    'These look like repeat payments based on your history. PayPro can\'t cancel them — do that with the merchant.';

const DAY_MS = 86400000;

/**
 * "in 3 days" / "today" / "2 days ago", from a date.
 *
 * Relative rather than absolute because the only question these screens answer
 * is "how soon?" — and a reader converting "14 Oct" into "next Tuesday" in
 * their head is doing work the interface should have done.
 */
export const formatNextExpected = (date) => {
    if (!date) return 'unknown';

    const target = new Date(date);
    if (Number.isNaN(target.getTime())) return 'unknown';

    // Compare whole days, not instants: a bill due at 09:00 tomorrow is "in 1
    // day" whether it is read at 08:00 or 23:00 today.
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTarget = new Date(target);
    startOfTarget.setHours(0, 0, 0, 0);

    const days = Math.round((startOfTarget - startOfToday) / DAY_MS);

    if (days === 0) return 'today';
    if (days === 1) return 'tomorrow';
    if (days === -1) return 'yesterday';
    if (days > 1 && days <= 30) return `in ${days} days`;
    if (days < -1 && days >= -30) return `${Math.abs(days)} days ago`;

    return target.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};
