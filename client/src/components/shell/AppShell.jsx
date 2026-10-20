import React, { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import TabBar from './TabBar';
import { AssistantProvider } from '../../context/AssistantContext';
import AssistantLauncher from '../../features/ai/AssistantLauncher';
import { PRIMARY_NAV } from '../../app/navigation';
import { prefetchWhenIdle } from '../../app/routePrefetch';
import { ROUTES } from '../../constants/routes';

/**
 * The authenticated frame.
 *
 * Responsibilities and nothing else: navigation chrome, the skip link, and the
 * scroll container. It renders no content of its own — the previous Layout
 * mounted a Topbar that printed a page title and a greeting, so every page in
 * the product had a heading it did not control and could not change.
 *
 * Layout notes:
 *
 *   - Scrolling belongs to <main>, not to the window. The old layout put
 *     `h-screen overflow-y-auto` on the content column *and* left the body
 *     scrollable, which on iOS produced two nested scroll areas and rubber-band
 *     bouncing that made the page feel broken.
 *   - The bottom padding on mobile clears the fixed tab bar. Without it the
 *     final row of any list sits permanently underneath the navigation, which
 *     is exactly where the "load more" button tends to end up.
 *   - The assistant's provider wraps the frame, outside the pathname-keyed
 *     <main>, so navigating does not remount it (plan.md §25.1). It renders
 *     nothing until a page calls `openAssistant()`.
 */
const AppShell = () => {
    const { pathname } = useLocation();

    // Once the first screen is up, fetch the other main destinations in idle
    // time so the first visit to each is as quick as a revisit.
    useEffect(
        () => prefetchWhenIdle([...PRIMARY_NAV.map((item) => item.to), ROUTES.INSIGHTS]),
        []
    );

    return (
        <AssistantProvider>
            <div className="flex min-h-dvh bg-canvas">
                {/*
                 * Skip link. The first thing in the tab order, visible only when
                 * focused. Without it a keyboard user traverses the entire sidebar
                 * and top bar on every single navigation before reaching content.
                 */}
                <a
                    href="#main"
                    className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-on-accent"
                >
                    Skip to content
                </a>

                <Sidebar />

                <div className="flex min-w-0 flex-1 flex-col">
                    <TopBar />

                    <main
                        id="main"
                        /**
                         * Keyed on the pathname so React remounts the subtree on
                         * navigation. That resets the scroll position and replays
                         * the entrance animation — without it, navigating from a
                         * scrolled-down Activity list to Home landed the user
                         * halfway down the new page.
                         */
                        key={pathname}
                        tabIndex={-1}
                        /**
                         * The bottom padding clears the tab bar on mobile and,
                         * at every size, the floating assistant launcher, so
                         * the last row of a page can always scroll out from
                         * under it.
                         */
                        className="flex-1 px-4 pb-36 pt-5 outline-none sm:px-6 lg:px-8 lg:pb-24"
                    >
                        {/* `page-enter` fades each top-level section of the
                            page up in turn (index.css). */}
                        <div className="page-enter mx-auto w-full max-w-5xl">
                            <Outlet />
                        </div>
                    </main>
                </div>

                <TabBar />
                <AssistantLauncher />
            </div>
        </AssistantProvider>
    );
};

export default AppShell;
