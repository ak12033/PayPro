import React from 'react';
import { Bell } from 'lucide-react';
import cn from '../../lib/cn';

/**
 * Body of a `toast.custom(...)` notification.
 *
 * Both the FCM foreground handler and the socket `notification_received`
 * handler rendered their own inline markup for this; they had drifted apart
 * (only one showed the bell) despite representing the same event.
 *
 * Themed rather than hardcoded dark, and `role="status"` so an arriving
 * notification is announced instead of appearing silently.
 */
const ToastCard = ({ title, message, visible = true }) => (
    <div
        role="status"
        className={cn(
            'pointer-events-auto flex w-full max-w-sm gap-3 rounded-card border border-border',
            'bg-overlay p-3.5 shadow-overlay',
            visible ? 'animate-rise' : 'opacity-0 transition-opacity'
        )}
    >
        <span
            aria-hidden="true"
            className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-text"
        >
            <Bell size={15} />
        </span>

        <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text">{title || 'New notification'}</p>
            {message && <p className="mt-0.5 text-sm leading-5 text-text-muted">{message}</p>}
        </div>
    </div>
);

export default ToastCard;
