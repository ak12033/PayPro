import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, Moon, Sun } from 'lucide-react';
import LogoMark from '../ui/LogoMark';
import cn from '../../lib/cn';
import { IconButton } from '../ui/Button';
import Avatar from '../ui/Avatar';
import { ROUTES, HOME_ROUTE } from '../../constants/routes';
import { APP_NAME } from '../../constants/app';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { useTheme } from '../../app/theme/ThemeProvider';
import useDisclosure from '../../hooks/useDisclosure';
import NotificationPanel from './NotificationPanel';

/**
 * Top bar.
 *
 * What it deliberately does *not* contain: a page title, a welcome message, or
 * a description of the current screen. The old topbar rendered "Welcome back,
 * {name}" and a paragraph of explanatory copy on every authenticated page,
 * regardless of which page it was — so roughly 180px of the viewport, on every
 * screen, was spent on a greeting the user had already read. On a phone that is
 * a quarter of the screen before any content.
 *
 * The bar is now chrome: identity, notifications, theme. Titles belong to the
 * pages that own them.
 */
const TopBar = () => {
    const { userName } = useAuth();
    const { unreadCount } = useNotifications();
    const { isDark, setTheme } = useTheme();
    const notifications = useDisclosure(false);
    const { pathname } = useLocation();

    return (
        <header
            className={cn(
                'sticky top-0 z-30 flex h-14 items-center gap-2 px-4 sm:h-16 sm:px-6',
                'border-b border-border-glass bg-canvas/80 backdrop-blur-xl'
            )}
        >
            {/* The wordmark only appears where the sidebar is hidden, so the
                product name is never rendered twice on the same screen. */}
            <Link to={HOME_ROUTE} className="flex items-center gap-2 lg:hidden">
                <LogoMark size={28} />
                <span className="text-sm font-semibold tracking-tight text-text">{APP_NAME}</span>
            </Link>

            <div className="flex-1" />

            <IconButton
                label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
                size="sm"
                onClick={() => setTheme(isDark ? 'light' : 'dark')}
            >
                {/* Keyed so the incoming icon remounts and turns into place. */}
                {isDark ? (
                    <Sun key="sun" size={18} className="animate-flip" />
                ) : (
                    <Moon key="moon" size={18} className="animate-flip" />
                )}
            </IconButton>

            <div className="relative">
                <IconButton
                    label={
                        unreadCount > 0
                            ? `Notifications, ${unreadCount} unread`
                            : 'Notifications'
                    }
                    size="sm"
                    aria-expanded={notifications.isOpen}
                    onClick={notifications.toggle}
                >
                    <Bell size={18} />
                </IconButton>

                {unreadCount > 0 && (
                    /**
                     * A count, not a pulsing dot.
                     *
                     * The old badge was an `animate-ping` red dot with no
                     * number — permanent motion in the corner of the eye that
                     * conveyed "something" without conveying how much, and that
                     * a user with a vestibular disorder cannot switch off. The
                     * count is also in the button's accessible name above, so
                     * this is purely the visual echo.
                     */
                    <span
                        // Keyed on the count so a new notification pops the
                        // badge once: one beat of motion, never a loop.
                        key={unreadCount}
                        aria-hidden="true"
                        className={cn(
                            'pointer-events-none absolute -right-0.5 -top-0.5 animate-pop',
                            'grid min-w-4 place-items-center rounded-pill bg-danger px-1',
                            'text-[10px] font-semibold leading-4 text-on-danger'
                        )}
                    >
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </div>

            <Link
                to={ROUTES.ACCOUNT}
                aria-current={pathname.startsWith(ROUTES.ACCOUNT) ? 'page' : undefined}
                className="ml-1 rounded-full transition-shadow duration-(--duration-hover) ease-(--ease-out) hover:shadow-lift"
            >
                <span className="sr-only">Account, signed in as {userName || 'your account'}</span>
                <Avatar name={userName} size="sm" />
            </Link>

            <NotificationPanel open={notifications.isOpen} onClose={notifications.close} />
        </header>
    );
};

export default TopBar;
