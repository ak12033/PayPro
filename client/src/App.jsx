import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { SocketProvider } from './context/SocketContext';
import { ThemeProvider } from './app/theme/ThemeProvider';
import ErrorBoundary from './components/feedback/ErrorBoundary';
import FullScreenLoader, { FullScreenLoaderHost } from './components/feedback/FullScreenLoader';
import ProtectedRoute from './components/ProtectedRoute';
import Toaster from './components/feedback/Toaster';
import Landing from './pages/Landing';
import SplashScreen from './pages/SplashScreen';
import AuthPage from './pages/auth/AuthPage';
import { HOME_ROUTE, LEGACY_REDIRECTS, ROUTES, WALLET_ROUTES } from './constants/routes';
import { env } from './app/config/env';

/** Consumer-wallet freeze (DEC-02). The API's CONSUMER_WALLET_ENABLED is what refuses the routes. */
const WALLET_ON = env.consumerWalletEnabled;

/**
 * Route map.
 *
 * Only the landing page and the login page are eager. Everything else is
 * code-split — the previous build shipped Recharts, the entire lucide icon set,
 * the Razorpay integration and every dashboard screen to a visitor who had not
 * signed in yet.
 *
 * There is no separate signup page: signup is a form inside the login page's
 * dialog. `/signup` just redirects to the login page.
 */
const LoginVerify = lazy(() => import('./pages/auth/LoginVerify'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'));

const AppShell = lazy(() => import('./components/shell/AppShell'));
const Home = lazy(() => import('./pages/Home'));
const MoneyHub = lazy(() => import('./pages/money/MoneyHub'));
const SendMoney = lazy(() => import('./pages/money/SendMoney'));
const AddMoney = lazy(() => import('./pages/money/AddMoney'));
const TransferVerify = lazy(() => import('./pages/money/TransferVerify'));
const Activity = lazy(() => import('./pages/Activity'));
const RecordTransaction = lazy(() => import('./pages/RecordTransaction'));
const Insights = lazy(() => import('./pages/Insights'));
const Budgets = lazy(() => import('./pages/insights/Budgets'));
const Goals = lazy(() => import('./pages/insights/Goals'));
const Bills = lazy(() => import('./pages/insights/Bills'));
const Tools = lazy(() => import('./pages/insights/Tools'));
const Support = lazy(() => import('./pages/account/Support'));
const Account = lazy(() => import('./pages/account/Account'));
const Security = lazy(() => import('./pages/account/Security'));
const Verification = lazy(() => import('./pages/account/Verification'));
const Withdraw = lazy(() => import('./pages/money/Withdraw'));
const Portfolio = lazy(() => import('./pages/insights/Portfolio'));
const NotFound = lazy(() => import('./pages/NotFound'));

/**
 * The operations console (plan.md §28.4). Its own chunks: a customer never
 * downloads a byte of it, and staff only fetch the section they open.
 */
const RequireRole = lazy(() => import('./components/RequireRole'));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const AdminOverview = lazy(() => import('./pages/admin/AdminOverview'));
const AdminRisk = lazy(() => import('./pages/admin/AdminRisk'));
const AdminSupport = lazy(() => import('./pages/admin/AdminSupport'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminReconciliation = lazy(() => import('./pages/admin/AdminReconciliation'));
const AdminWebhooks = lazy(() => import('./pages/admin/AdminWebhooks'));
const AdminAudit = lazy(() => import('./pages/admin/AdminAudit'));
const AdminTransactions = lazy(() => import('./pages/admin/AdminTransactions'));
const AdminPayments = lazy(() => import('./pages/admin/AdminPayments'));
const AdminKyc = lazy(() => import('./pages/admin/AdminKyc'));
const AdminAml = lazy(() => import('./pages/admin/AdminAml'));
const AdminWithdrawals = lazy(() => import('./pages/admin/AdminWithdrawals'));

const App = () => (
    <ErrorBoundary>
        <BrowserRouter>
            <ThemeProvider>
                <FullScreenLoaderHost>
                    <AuthProvider>
                        <NotificationProvider>
                            <SocketProvider>
                                <Toaster />

                                <Suspense fallback={<FullScreenLoader srLabel="Loading page" />}>
                                    <Routes>
                                        {/* ------------------------------ public */}
                                        <Route path={ROUTES.LANDING} element={<SplashScreen />} />
                                        <Route path={ROUTES.WELCOME} element={<Landing />} />
                                        <Route path={ROUTES.LOGIN} element={<AuthPage />} />
                                        <Route
                                            path={ROUTES.SIGNUP}
                                            element={<Navigate to={ROUTES.LOGIN} replace />}
                                        />
                                        <Route path={ROUTES.LOGIN_2FA} element={<LoginVerify />} />
                                        <Route path={ROUTES.FORGOT_PASSWORD} element={<ForgotPassword />} />
                                        <Route path={ROUTES.RESET_PASSWORD} element={<ResetPassword />} />

                                        {/* --------------------- authenticated */}
                                        <Route element={<ProtectedRoute />}>
                                            {/*
                                             * Outside the shell: verification is a
                                             * committed flow, so the navigation is
                                             * removed to leave exactly one way
                                             * forward and one way out.
                                             */}
                                            {WALLET_ON && (
                                                <Route
                                                    path={ROUTES.TRANSFER_2FA}
                                                    element={<TransferVerify />}
                                                />
                                            )}

                                            <Route element={<AppShell />}>
                                                {/*
                                                 * The consumer wallet (DEC-02, CAP-LEG-1).
                                                 * Frozen, every path below redirects to
                                                 * HOME_ROUTE instead; see WALLET_ROUTES.
                                                 */}
                                                {WALLET_ON && (
                                                    <>
                                                        <Route path={ROUTES.HOME} element={<Home />} />

                                                        <Route path={ROUTES.MONEY} element={<MoneyHub />} />
                                                        <Route path={ROUTES.SEND} element={<SendMoney />} />
                                                        <Route path={ROUTES.ADD_MONEY} element={<AddMoney />} />
                                                        <Route path={ROUTES.WITHDRAW} element={<Withdraw />} />

                                                        <Route path={ROUTES.ACTIVITY} element={<Activity />} />
                                                        <Route
                                                            path={ROUTES.ACTIVITY_MANUAL_ENTRY}
                                                            element={<RecordTransaction />}
                                                        />

                                                        <Route path={ROUTES.INSIGHTS} element={<Insights />} />
                                                        <Route path={ROUTES.BUDGETS} element={<Budgets />} />
                                                        <Route path={ROUTES.GOALS} element={<Goals />} />
                                                        <Route path={ROUTES.BILLS} element={<Bills />} />
                                                        <Route path={ROUTES.TOOLS} element={<Tools />} />
                                                        <Route path={ROUTES.PORTFOLIO} element={<Portfolio />} />
                                                        <Route path={ROUTES.VERIFICATION} element={<Verification />} />
                                                    </>
                                                )}
                                                <Route path={ROUTES.SUPPORT} element={<Support />} />

                                                <Route path={ROUTES.ACCOUNT} element={<Account />} />
                                                <Route path={ROUTES.SECURITY} element={<Security />} />

                                                {/* ------------------- operations console */}
                                                <Route element={<RequireRole />}>
                                                    <Route element={<AdminLayout />}>
                                                        <Route path={ROUTES.ADMIN} element={<RequireRole capability="viewMetrics"><AdminOverview /></RequireRole>} />
                                                        <Route path={ROUTES.ADMIN_RISK} element={<RequireRole capability="reviewRisk"><AdminRisk /></RequireRole>} />
                                                        <Route path={ROUTES.ADMIN_SUPPORT} element={<RequireRole capability="workSupport"><AdminSupport /></RequireRole>} />
                                                        <Route path={ROUTES.ADMIN_USERS} element={<RequireRole capability="viewUsers"><AdminUsers /></RequireRole>} />
                                                        <Route path={ROUTES.ADMIN_TRANSACTIONS} element={<RequireRole capability="searchTransactions"><AdminTransactions /></RequireRole>} />
                                                        <Route path={ROUTES.ADMIN_PAYMENTS} element={<RequireRole capability="viewPayments"><AdminPayments /></RequireRole>} />
                                                        <Route path={ROUTES.ADMIN_RECONCILIATION} element={<RequireRole capability="viewReconciliation"><AdminReconciliation /></RequireRole>} />
                                                        <Route path={ROUTES.ADMIN_WEBHOOKS} element={<RequireRole capability="viewWebhooks"><AdminWebhooks /></RequireRole>} />
                                                        <Route path={ROUTES.ADMIN_AUDIT} element={<RequireRole capability="viewAuditLog"><AdminAudit /></RequireRole>} />
                                                        <Route path={ROUTES.ADMIN_KYC} element={<RequireRole capability="reviewKyc"><AdminKyc /></RequireRole>} />
                                                        <Route path={ROUTES.ADMIN_AML} element={<RequireRole capability="viewAml"><AdminAml /></RequireRole>} />
                                                        <Route path={ROUTES.ADMIN_WITHDRAWALS} element={<RequireRole capability="processWithdrawals"><AdminWithdrawals /></RequireRole>} />
                                                    </Route>
                                                </Route>
                                            </Route>

                                            {!WALLET_ON && WALLET_ROUTES.map((path) => (
                                                <Route key={path} path={path} element={<Navigate to={HOME_ROUTE} replace />} />
                                            ))}
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
                </FullScreenLoaderHost>
            </ThemeProvider>
        </BrowserRouter>
    </ErrorBoundary>
);

export default App;
