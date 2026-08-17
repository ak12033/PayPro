import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import cn from '../../lib/cn';
import { PRIMARY_NAV, isNavItemActive } from '../../app/navigation';

/**
 * Mobile primary navigation.
 *
 * A bottom bar rather than a hamburger, for a reason specific to this product:
 * the two things people do most (check the balance, send money) should be one
 * thumb-reachable tap apart. A drawer makes every navigation two taps and puts
 * the trigger in the top-left corner, which is the hardest point on a phone for
 * a right-handed user to reach.
 *
 * Hidden on desktop, where the sidebar takes over — the two are never both
 * visible, so there is exactly one primary navigation on screen at any width.
 */
const TabBar = () => {
    const { pathname } = useLocation();

    return (
        <nav
            aria-label="Primary"
            className={cn(
                'fixed inset-x-0 bottom-0 z-40 lg:hidden',
                'border-t border-border bg-surface/95 backdrop-blur-md',
                'pb-safe'
            )}
        >
            <ul className="mx-auto flex max-w-lg items-stretch">
                {PRIMARY_NAV.map((item) => {
                    const active = isNavItemActive(item, pathname);
                    const Icon = item.icon;

                    return (
                        <li key={item.to} className="flex-1">
                            <Link
                                to={item.to}
                                aria-current={active ? 'page' : undefined}
                                className={cn(
                                    'flex min-h-14 flex-col items-center justify-center gap-1 px-1 pt-2',
                                    'transition-colors duration-[--duration-fast]',
                                    active ? 'text-accent' : 'text-text-muted'
                                )}
                            >
                                {/* The active pill sits behind the icon rather than
                                    recolouring the label alone, so the current tab is
                                    distinguishable without relying on hue. */}
                                <span
                                    className={cn(
                                        'grid h-7 w-12 place-items-center rounded-pill',
                                        'transition-colors duration-[--duration-fast]',
                                        active && 'bg-accent-soft'
                                    )}
                                >
                                    <Icon size={20} strokeWidth={active ? 2.4 : 2} aria-hidden="true" />
                                </span>
                                <span className="text-2xs font-medium tracking-normal">
                                    {item.label}
                                </span>
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
};

export default TabBar;
