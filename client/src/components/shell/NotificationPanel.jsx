import React, { useMemo, useState } from 'react';
import { BellOff, Check } from 'lucide-react';
import Sheet from '../ui/Sheet';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import SegmentedControl from '../ui/SegmentedControl';
import EmptyState from '../feedback/EmptyState';
import cn from '../../lib/cn';
import { useNotifications } from '../../context/NotificationContext';
import { formatRelativeTime } from '../../utils/formatters';
import {
    NOTIFICATION_FILTERS,
    getNotificationKind,
    sortNotifications,
} from '../../constants/notifications';

/**
 * The notification centre.
 *
 * Three changes from the dropdown it replaces, all of them about triage rather
 * than styling:
 *
 *   1. It is sorted by urgency, not purely by recency — see
 *      `sortNotifications`. A security alert does not fall off the top of the
 *      list because three payment receipts arrived after it.
 *   2. Kind is shown by icon *and* label, so "this is a security alert" does
 *      not depend on noticing an amber tint.
 *   3. It is a Sheet, so it is a bottom sheet on mobile. The old absolutely
 *      positioned `w-96` dropdown was wider than a phone screen and hung off
 *      the right edge with no way to scroll to what it was hiding.
 */
const NotificationPanel = ({ open, onClose }) => {
    const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
    const [filter, setFilter] = useState('all');

    const visible = useMemo(() => {
        const sorted = sortNotifications(notifications);
        if (filter === 'all') return sorted;

        const spec = NOTIFICATION_FILTERS.find((f) => f.value === filter);
        const types = spec?.types ?? [filter];
        return sorted.filter((item) => types.includes(item.type));
    }, [notifications, filter]);

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title="Notifications"
            description={
                unreadCount > 0 ? `${unreadCount} unread` : 'You are all caught up'
            }
            size="md"
            footer={
                unreadCount > 0 ? (
                    <Button
                        variant="secondary"
                        fullWidth
                        icon={<Check size={16} />}
                        onClick={markAllAsRead}
                    >
                        Mark all as read
                    </Button>
                ) : null
            }
        >
            <SegmentedControl
                label="Notification type"
                options={NOTIFICATION_FILTERS.map(({ value, label }) => ({ value, label }))}
                value={filter}
                onChange={setFilter}
                size="sm"
                className="mb-3"
            />

            {visible.length === 0 ? (
                <EmptyState
                    variant={notifications.length === 0 ? 'first-run' : 'no-results'}
                    icon={<BellOff size={20} />}
                    title={
                        notifications.length === 0
                            ? 'No notifications yet'
                            : 'Nothing in this category'
                    }
                    description={
                        notifications.length === 0
                            ? "We'll tell you here when money moves or something needs your attention."
                            : 'Try a different category.'
                    }
                />
            ) : (
                <ul className="space-y-1.5">
                    {visible.map((item) => {
                        const kind = getNotificationKind(item.type);
                        const Icon = kind.icon;

                        return (
                            <li key={item._id}>
                                <div
                                    className={cn(
                                        'flex gap-3 rounded-card border p-3',
                                        item.isRead
                                            ? 'border-transparent bg-transparent'
                                            : 'border-border bg-surface-sunken'
                                    )}
                                >
                                    <span
                                        aria-hidden="true"
                                        className={cn(
                                            'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full',
                                            kind.tone === 'warning' && 'bg-warning-soft text-warning',
                                            kind.tone === 'accent' && 'bg-accent-soft text-accent-text',
                                            kind.tone === 'positive' && 'bg-positive-soft text-positive',
                                            kind.tone === 'neutral' && 'bg-surface-active text-text-muted'
                                        )}
                                    >
                                        <Icon size={15} />
                                    </span>

                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                            <p
                                                className={cn(
                                                    'text-sm',
                                                    item.isRead
                                                        ? 'text-text-secondary'
                                                        : 'font-medium text-text'
                                                )}
                                            >
                                                {item.title}
                                            </p>
                                            {!item.isRead && kind.sticky && (
                                                <Badge tone="warning" size="sm">
                                                    Action needed
                                                </Badge>
                                            )}
                                        </div>

                                        <p className="mt-0.5 text-xs leading-5 text-text-muted">
                                            {item.message}
                                        </p>

                                        <p className="mt-1 text-2xs text-text-muted">
                                            {kind.label} · <time dateTime={item.createdAt}>
                                                {formatRelativeTime(item.createdAt)}
                                            </time>
                                        </p>
                                    </div>

                                    {!item.isRead && (
                                        <button
                                            type="button"
                                            onClick={() => markAsRead(item._id)}
                                            aria-label={`Mark "${item.title}" as read`}
                                            className="h-8 w-8 shrink-0 rounded-control text-text-muted hover:bg-surface-hover hover:text-text"
                                        >
                                            <Check size={15} className="mx-auto" />
                                        </button>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Sheet>
    );
};

export default NotificationPanel;
