import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { SocketProvider } from './context/SocketContext';
import { ThemeProvider } from './app/theme/ThemeProvider';
import ErrorBoundary from './components/feedback/ErrorBoundary';
import FullScreenLoader from './components/feedback/FullScreenLoader';
import ProtectedRoute from './components/ProtectedRoute';
import Toaster from './components/feedback/Toaster';
import Landing from './pages/Landing';
import Login from './pages/auth/Login';
import { LEGACY_REDIRECTS, ROUTES } from './constants/routes';

/**
 * Route map.
 *
 * Only the landing page and the login form are eager. Everything else is
 * code-split — the previous build shipped Recharts, the entire lucide icon set,
 * the Razorpay integration and every dashboard screen to a visitor who had not
 * signed in yet.
 *
 * Signup is lazy despite being a first-run screen: it is reached from a click,
 * so the chunk fetches while the user is still reading the landing page.
 */
const Signup = lazy(() => import('./pages/auth/Signup'));
const LoginVerify = lazy(() => import('./pages/auth/LoginVerify'));

const AppShell = lazy(() => import('./components/shell/AppShell'));
const Home = lazy(() => import('./pages/Home'));
const MoneyHub = lazy(() => import('./pages/money/MoneyHub'));
const SendMoney = lazy(() => import('./pages/money/SendMoney'));
const AddMoney = lazy(() => import('./pages/money/AddMoney'));
const TransferVerify = lazy(() => import('./pages/money/TransferVerify'));
const Activity = lazy(() => import('./pages/Activity'));
const RecordTransaction = lazy(() => import('./pages/RecordTransaction'));
const Insights = lazy(() => import('./pages/Insights'));
const Account = lazy(() => import('./pages/account/Account'));
const Security = lazy(() => import('./pages/account/Security'));
const NotFound = lazy(() => import('./pages/NotFound'));

const App = () => (
    <ErrorBoundary>
        <BrowserRouter>
            <ThemeProvider>
                <AuthProvider>
                    <NotificationProvider>
                        <SocketProvider>
                            <Toaster />

                            <Suspense fallback={<FullScreenLoader srLabel="Loading page" />}>
                                <Routes>
                                    {/* ------------------------------ public */}
                                    <Route path={ROUTES.LANDING} element={<Landing />} />
                                    <Route path={ROUTES.LOGIN} element={<Login />} />
                                    <Route path={ROUTES.SIGNUP} element={<Signup />} />
                                    <Route path={ROUTES.LOGIN_2FA} element={<LoginVerify />} />

                                    {/* --------------------- authenticated */}
                                    <Route element={<ProtectedRoute />}>
                                        {/*
                                         * Outside the shell: verification is a
                                         * committed flow, so the navigation is
                                         * removed to leave exactly one way
                                         * forward and one way out.
                                         */}
                                        <Route
                                            path={ROUTES.TRANSFER_2FA}
                                            element={<TransferVerify />}
                                        />

                                        <Route element={<AppShell />}>
                                            <Route path={ROUTES.HOME} element={<Home />} />

                                            <Route path={ROUTES.MONEY} element={<MoneyHub />} />
                                            <Route path={ROUTES.SEND} element={<SendMoney />} />
                                            <Route path={ROUTES.ADD_MONEY} element={<AddMoney />} />

                                            <Route path={ROUTES.ACTIVITY} element={<Activity />} />
                                            <Route
                                                path={ROUTES.ACTIVITY_MANUAL_ENTRY}
                                                element={<RecordTransaction />}
                                            />

                                            <Route path={ROUTES.INSIGHTS} element={<Insights />} />

                                            <Route path={ROUTES.ACCOUNT} element={<Account />} />
                                            <Route path={ROUTES.SECURITY} element={<Security />} />
                                        </Route>
                                    </Route>

                                    {/*
                                     * Pre-redesign paths.
                                     *
                                     * A bookmarked /dashboard, or a push
                                     * notification linking to /payment-history,
                                     * must not 404 because we reorganised the
                                     * navigation. `replace` keeps the dead path
                                     * out of the history stack, so Back does
                                     * not bounce the user through the redirect
                                     * again.
                                     */}
                                    {Object.entries(LEGACY_REDIRECTS).map(([from, to]) => (
                                        <Route
                                            key={from}
                                            path={from}
                                            element={<Navigate to={to} replace />}
                                        />
                                    ))}

                                    <Route path={ROUTES.NOT_FOUND} element={<NotFound />} />
                                </Routes>
                            </Suspense>
                        </SocketProvider>
                    </NotificationProvider>
                </AuthProvider>
            </ThemeProvider>
        </BrowserRouter>
    </ErrorBoundary>
);

export default App;
