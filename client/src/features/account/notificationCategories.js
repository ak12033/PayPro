/**
 * The push categories a user can switch off, and quiet-hours helpers
 * (plan.md §26.2.4, §26.2.5). Keys mirror `MUTABLE_CATEGORIES` in
 * `server/services/notificationPolicy.js`, which is what actually decides.
 *
 * There is no security row, on purpose: sign-in and credential alerts cannot be
 * muted or held back by quiet hours (§26.3), and the sheet says so rather than
 * showing a switch that is permanently on.
 */
export const PUSH_CATEGORIES = [
    { key: 'payment', label: 'Money movement', description: 'Transfers sent and received, top-ups, refunds.' },
    { key: 'budget', label: 'Budgets', description: 'When spending nears or passes a limit.' },
    { key: 'goal', label: 'Goals', description: 'Milestones and goals falling behind.' },
    { key: 'bills', label: 'Bills & reminders', description: 'Bills coming due. PayPro never pays them.' },
    { key: 'insights', label: 'Insights', description: 'Patterns worth knowing about in your spending.' },
    { key: 'support', label: 'Support', description: 'Replies on your support tickets.' },
];

export const DEFAULT_QUIET_HOURS = { enabled: false, start: 22, end: 7 };

/** 0 → "12:00 AM", 22 → "10:00 PM". */
export const hourLabel = (hour) => {
    const twelve = hour % 12 === 0 ? 12 : hour % 12;
    return `${twelve}:00 ${hour < 12 ? 'AM' : 'PM'}`;
};

/** Plain-language summary of a quiet-hours setting, or null when it does nothing. */
export const describeQuietHours = (quietHours) => {
    if (!quietHours?.enabled || quietHours.start === quietHours.end) return null;
    return `${hourLabel(quietHours.start)} – ${hourLabel(quietHours.end)}`;
};
