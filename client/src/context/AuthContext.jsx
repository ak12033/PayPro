import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { userApi } from '../services/api/endpoints/userApi';
import { transactionApi } from '../services/api/endpoints/transactionApi';
import { authApi } from '../services/api/endpoints/authApi';
import { notificationApi } from '../services/api/endpoints/notificationApi';
import { getIssuedPushToken } from '../services/firebase';
import {
    setAccessToken as persistAccessToken,
    subscribeToAccessToken,
} from '../services/auth/tokenStore';
import { refreshSession } from '../services/auth/refreshSession';
import { AUTH_EXPIRED_EVENT } from '../constants/app';
import { PUBLIC_ROUTES, ROUTES } from '../constants/routes';
import { RECENT_FETCH_LIMIT } from '../constants/transactions';
import { env } from '../app/config/env';
import { balanceMinorOf, fromMinor } from '../lib/money';

const AuthContext = createContext(null);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within an AuthProvider');
    return context;
};

/**
 * Session, plus the small amount of user data every screen needs.
 *
 * Scope note: this is deliberately *not* a general-purpose store. It holds the
 * token, the profile, the balance, and a short list of recent transactions —
 * the four things that are genuinely global. Page data belongs to pages, via
 * `useQuery`.
 *
 * The previous version also held `allTransactions`, the full result of an
 * unbounded history fetch, in context on every screen. For an active account
 * that was megabytes of state kept alive for the lifetime of the session, and
 * it re-rendered every consumer whenever it changed.
 */
export const AuthProvider = ({ children }) => {
    const [token, setTokenState] = useState(null);
    const [user, setUser] = useState(null);
    /**
     * Held in integer paise (plan.md §7.4 step 3). `balance` in rupees is
     * derived below for the screens that still do rupee arithmetic on it
     * (form hints, "new balance" previews); anything that *renders* the
     * balance should use `balanceMinor` with `<Amount minor>`.
     */
    const [balanceMinor, setBalanceMinor] = useState(0);
    const [recentTransactions, setRecentTransactions] = useState([]);
    const [isCheckingAuth, setIsCheckingAuth] = useState(true);

    const navigate = useNavigate();

    /**
     * `navigate` identity changes between renders in some router versions.
     * Holding it in a ref lets the auth-expired listener stay mounted for the
     * lifetime of the provider without re-subscribing.
     */
    const navigateRef = useRef(navigate);
    navigateRef.current = navigate;

    const setToken = useCallback((next) => {
        persistAccessToken(next);
        setTokenState(next);
    }, []);

    const clearAuth = useCallback(() => {
        persistAccessToken(null);
        setTokenState(null);
        setUser(null);
        setBalanceMinor(0);
        setRecentTransactions([]);
    }, []);

    /**
     * Mirror silent refreshes into React state.
     *
     * The axios interceptor exchanges the refresh cookie for a new access token
     * without going through this provider. Subscribing is what keeps `token`
     * here — and everything derived from it — in step with the token that
     * requests are actually being sent with.
     */
    useEffect(() => subscribeToAccessToken(setTokenState), []);

    const fetchDashboardData = useCallback(async () => {
        const { data: profile } = await userApi.getProfile();

        setUser(profile);
        setBalanceMinor(balanceMinorOf(profile));

        /**
         * `/transactions/recent` is bounded server-side. It used to return the
         * user's entire history, and the whole array was held in context on
         * every page.
         */
        // Not routed while the consumer wallet is frozen (DEC-02); a 404 here
        // would fail the whole load and sign the user out.
        if (env.consumerWalletEnabled) {
            const { data: recent } = await transactionApi.getRecent(RECENT_FETCH_LIMIT);
            setRecentTransactions(recent.transactions ?? []);
        }

        return profile;
    }, []);

    useEffect(() => {
        let cancelled = false;

        const initialise = async () => {
            try {
                /**
                 * Refresh *first*, then load.
                 *
                 * The access token is memory-only, so after a reload there is
                 * none — only the httpOnly refresh cookie. Calling a protected
                 * endpoint first sends a request with no Authorization header,
                 * which the server answers with `NO_TOKEN` rather than
                 * `TOKEN_EXPIRED`; the interceptor treats that as unrecoverable
                 * and signs the user out. See `refreshSession` for the full
                 * account — the symptom was that every hard refresh ended the
                 * session even with a valid cookie.
                 */
                const accessToken = await refreshSession();
                if (cancelled) return;

                if (!accessToken) {
                    clearAuth();
                    return;
                }

                setTokenState(accessToken);
                await fetchDashboardData();
            } catch {
                // No usable refresh cookie: there is genuinely no session to
                // restore, which is the normal state for a first-time visitor.
                if (!cancelled) clearAuth();
            } finally {
                if (!cancelled) setIsCheckingAuth(false);
            }
        };

        initialise();

        /**
         * Reads `window.location` at call time rather than closing over the
         * pathname. The previous handler captured the path from the first
         * render and never re-subscribed, so after any navigation it compared
         * against a stale value and could redirect a user who was already
         * sitting on the login screen.
         */
        const handleAuthExpired = () => {
            clearAuth();
            if (!PUBLIC_ROUTES.includes(window.location.pathname)) {
                navigateRef.current(ROUTES.LOGIN, { replace: true });
            }
        };

        window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
        return () => {
            cancelled = true;
            window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
        };
    }, [fetchDashboardData, clearAuth]);

    /**
     * Load the profile for a session that started *after* mount.
     *
     * `initialise` above only covers the session restored on page load. Login,
     * 2FA verification and signup just hand over a token via `setToken`, so
     * without this the profile, balance and recent transactions stayed empty
     * (and RequireRole waited on `user` forever) until the user reloaded.
     *
     * The ref keeps one load in flight: a silent token refresh while it runs
     * changes `token` but must not start a second one.
     */
    const loadingProfileRef = useRef(false);
    useEffect(() => {
        if (isCheckingAuth || !token || user || loadingProfileRef.current) return;
        loadingProfileRef.current = true;
        fetchDashboardData()
            .catch(() => {
                // A 401 is already handled by the interceptor (refresh or
                // sign-out); anything else leaves the screens on their empty
                // state, the same as a failed load on page reload.
            })
            .finally(() => {
                loadingProfileRef.current = false;
            });
    }, [isCheckingAuth, token, user, fetchDashboardData]);

    const logout = useCallback(async () => {
        /**
         * Detach this device from the account before ending the session.
         *
         * Signing out used to leave the FCM token registered, so a signed-out
         * browser carried on receiving that account's push notifications — and
         * if somebody else then signed in on the same device, they received
         * them too. It must happen before `authApi.logout()`, while the access
         * token is still valid.
         */
        const deviceToken = getIssuedPushToken();
        if (deviceToken) {
            await notificationApi.unregisterDeviceToken(deviceToken).catch(() => {});
        }

        try {
            await authApi.logout();
        } catch {
            // A failed logout call still has to clear the local session.
            // Leaving the user signed in because the network blipped is the
            // wrong failure mode for a sign-out button.
        }
        clearAuth();
        navigateRef.current(ROUTES.LOGIN, { replace: true });
    }, [clearAuth]);

    /**
     * Memoised so the context value is not a fresh object on every render.
     * Without this, every consumer of `useAuth` — which is most of the app —
     * re-renders whenever the provider does.
     */
    const value = useMemo(
        () => ({
            token,
            setToken,
            user,
            setUser,
            userName: user?.firstName ?? '',
            balance: fromMinor(balanceMinor),
            balanceMinor,
            setBalanceMinor,
            recentTransactions,
            setRecentTransactions,
            fetchDashboardData,
            logout,
            isCheckingAuth,
            isAuthenticated: Boolean(token),
        }),
        [
            token,
            setToken,
            user,
            balanceMinor,
            recentTransactions,
            fetchDashboardData,
            logout,
            isCheckingAuth,
        ]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
