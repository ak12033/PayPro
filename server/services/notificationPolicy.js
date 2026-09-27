/**
 * Whether a notification may be *pushed* right now (plan.md §26.2.4, §26.2.5).
 *
 * Pure — no database, no config import, the clock passed in — so every branch
 * is unit-testable, the same split `riskEvaluationService` uses.
 *
 * What it governs, and what it deliberately does not:
 *
 *   - Only the push. The in-app row is always written, so anything held back by
 *     a category switch or quiet hours is waiting in the notification panel.
 *     Email is governed separately by `emailAlerts` in `emailService`.
 *   - The master `pushNotifications` switch still wins over everything. It is
 *     paired with this device's browser permission in the UI, and "no push at
 *     all" is a promise the switch makes.
 *   - **Security notifications ignore categories and quiet hours** (§26.3). A
 *     user must not be able to mute, or sleep through, the alert that says
 *     someone else just signed in to their wallet. `System` (reconciliation
 *     alerts to staff) is treated the same way for the same reason.
 */

/** Notification.type → the preference category that governs it. */
export const CATEGORY_BY_TYPE = {
    Transfer: 'payment',
    Payment: 'payment',
    Security: 'security',
    System: 'system',
    Budget: 'budget',
    Goal: 'goal',
    Bill: 'bills',
    Reminder: 'bills',
    Insight: 'insights',
    Support: 'support',
    /**
     * Identity verification and bank-account outcomes (plan.md §0.20.2: "in a
     * category the user cannot mute"). A user must hear that their verification
     * was rejected, or that a bank account they did not add was just approved.
     */
    Account: 'account',
};

/** Categories a user may switch off. Anything not listed here is always on. */
export const MUTABLE_CATEGORIES = ['payment', 'budget', 'goal', 'bills', 'insights', 'support'];

/** The hour (0–23) of `now` in `timeZone`. */
export const hourIn = (now, timeZone = 'Asia/Kolkata') => {
    const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(now));
    return hour === 24 ? 0 : hour;
};

/**
 * `[start, end)` in whole hours. A window that wraps midnight (22 → 7) is the
 * common case; `start === end` is treated as "no window", not "all day", so a
 * half-edited setting can never silence everything.
 */
export const inQuietHours = (quietHours, hour) => {
    if (!quietHours?.enabled) return false;
    const { start, end } = quietHours;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start === end) return false;
    return start < end ? hour >= start && hour < end : hour >= start || hour < end;
};

/** `{ send, reason }` — `reason` is null when sending, otherwise why not. */
export const pushDecision = ({ type, preferences = {}, now = new Date(), timeZone = 'Asia/Kolkata' }) => {
    if (preferences.pushNotifications === false) return { send: false, reason: 'push_disabled' };

    const category = CATEGORY_BY_TYPE[type] ?? 'system';
    if (!MUTABLE_CATEGORIES.includes(category)) return { send: true, reason: null };

    if (preferences.pushCategories?.[category] === false) return { send: false, reason: 'category_disabled' };
    if (inQuietHours(preferences.quietHours, hourIn(now, timeZone))) return { send: false, reason: 'quiet_hours' };

    return { send: true, reason: null };
};

export default { pushDecision, inQuietHours, hourIn, CATEGORY_BY_TYPE, MUTABLE_CATEGORIES };
