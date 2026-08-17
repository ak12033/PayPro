import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import TabBar from './TabBar';

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
 */
const AppShell = () => {
    const { pathname } = useLocation();

    return (
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
                    className="flex-1 px-4 pb-24 pt-5 outline-none sm:px-6 sm:pb-10 lg:px-8 lg:pb-12"
                >
                    <div className="mx-auto w-full max-w-5xl animate-fade-in">
                        <Outlet />
                    </div>
                </main>
            </div>

            <TabBar />
        </div>
    );
};

export default AppShell;
