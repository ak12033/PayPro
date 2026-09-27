import { ShieldAlert, ArrowLeftRight, Wallet, Bell, Clock, BadgeCheck } from 'lucide-react';

/**
 * Notification taxonomy.
 *
 * The backend has always written a `type` onto every notification — one of
 * Payment, Security, Transfer, Reminder, System — and the frontend has always
 * ignored it, rendering all five as identical grey cards in reverse
 * chronological order.
 *
 * That flattening has a concrete cost. "Sign-in from a new device in another
 * city" and "Your monthly summary is ready" arrived looking the same, so the
 * one that needed action within minutes was buried under the one that needed
 * none, sorted only by which happened to be newer.
 *
 * `priority` drives ordering; `tone` drives appearance. Security outranks
 * recency: a security notification stays at the top until it is read, because
 * an unread account-compromise warning is the single most time-sensitive thing
 * this product can tell someone.
 */
export const NOTIFICATION_KINDS = {
    Security: {
        label: 'Security',
        icon: ShieldAlert,
        tone: 'warning',
        priority: 0,
        /** Read state does not demote it; the user may need to act again. */
        sticky: true,
    },
    Transfer: {
        label: 'Transfers',
        icon: ArrowLeftRight,
        tone: 'accent',
        priority: 1,
        sticky: false,
    },
    Payment: {
        label: 'Payments',
        icon: Wallet,
        tone: 'positive',
        priority: 1,
        sticky: false,
    },
    /**
     * Identity verification and bank-account outcomes (Phase 5). Not mutable
     * on the server, and ranked with money: "action needed on your
     * verification" is something the holder has to act on.
     */
    Account: {
        label: 'Account',
        icon: BadgeCheck,
        tone: 'info',
        priority: 1,
        sticky: false,
    },
    Reminder: {
        label: 'Reminders',
        icon: Clock,
        tone: 'neutral',
        priority: 2,
        sticky: false,
    },
    System: {
        label: 'System',
        icon: Bell,
        tone: 'neutral',
        priority: 3,
        sticky: false,
    },
};

export const NOTIFICATION_FALLBACK = NOTIFICATION_KINDS.System;

export const getNotificationKind = (type) =>
    NOTIFICATION_KINDS[type] ?? NOTIFICATION_FALLBACK;

/**
 * Sorts by urgency, then recency.
 *
 * Unread beats read within a priority band, because an unread item is the one
 * still asking for attention. Sticky kinds (Security) sort above everything
 * regardless of read state.
 */
export const sortNotifications = (notifications = []) =>
    [...notifications].sort((a, b) => {
        const ka = getNotificationKind(a.type);
        const kb = getNotificationKind(b.type);

        const urgencyA = ka.sticky && !a.isRead ? -1 : ka.priority;
        const urgencyB = kb.sticky && !b.isRead ? -1 : kb.priority;
        if (urgencyA !== urgencyB) return urgencyA - urgencyB;

        if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;

        return new Date(b.createdAt) - new Date(a.createdAt);
    });

/** Tabs offered in the notification panel. */
export const NOTIFICATION_FILTERS = [
    { value: 'all', label: 'All' },
    { value: 'Security', label: 'Security' },
    { value: 'money', label: 'Money', types: ['Transfer', 'Payment'] },
];
