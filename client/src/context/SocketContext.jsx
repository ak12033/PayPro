import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { io } from 'socket.io-client';
import { toast } from 'react-hot-toast';
import { useAuth } from './AuthContext';
import { useNotifications } from './NotificationContext';
import { env } from '../app/config/env';
import { getAccessToken } from '../services/auth/tokenStore';
import { refreshSession } from '../services/auth/refreshSession';
import { RECENT_FETCH_LIMIT } from '../constants/transactions';
import { CURRENCY_LOCALE, CURRENCY_SYMBOL } from '../constants/app';
import { amountMinorOf, balanceMinorOf, fromMinor, newBalanceMinorOf } from '../lib/money';

const SocketContext = createContext(null);

export const useSocket = () => useContext(SocketContext);

const formatAmount = (value) =>
    `${CURRENCY_SYMBOL}${Number(value || 0).toLocaleString(CURRENCY_LOCALE)}`;

/**
 * How many times we will try to rescue an authentication failure by refreshing
 * the access token before giving up. Bounded so a genuinely dead session cannot
 * turn into an endless refresh/reconnect loop against the server.
 */
const MAX_AUTH_RECOVERIES = 3;

export const SocketProvider = ({ children }) => {
    const { token, setRecentTransactions, setBalanceMinor, setUser, fetchDashboardData, logout } =
        useAuth();

    const { refreshNotifications, showNotificationToast } = useNotifications();
    const [socket, setSocket] = useState(null);
    const [isConnected, setIsConnected] = useState(false);

    /**
     * Handlers live behind a ref so the effect can depend on session presence
     * alone. Listing them as dependencies would tear down and rebuild the
     * websocket on every render in which any of them changed identity.
     */
    const handlersRef = useRef({});
    handlersRef.current = {
        setBalanceMinor,
        setRecentTransactions,
        setUser,
        fetchDashboardData,
        refreshNotifications,
        showNotificationToast,
        logout,
    };

    /**
     * Page-level subscribers to money movement.
     *
     * Screens that keep their own list (Activity, Insights) cannot read the
     * balance out of AuthContext and be done with it — they hold a query result.
     * They subscribe here instead, so a transfer that arrives over the socket
     * lands in every list on screen rather than only in the ones that happen to
     * be backed by context.
     */
    const listenersRef = useRef(new Set());

    const subscribe = useCallback((listener) => {
        listenersRef.current.add(listener);
        return () => listenersRef.current.delete(listener);
    }, []);

    const publish = useCallback((event, payload) => {
        listenersRef.current.forEach((listener) => {
            try {
                listener(event, payload);
            } catch {
                // One screen's handler throwing must not stop the others from
                // being updated.
            }
        });
    }, []);

    /**
     * The socket's lifetime is tied to *having a session*, not to the value of
     * the access token.
     *
     * Depending on `token` directly would drop and rebuild the connection every
     * 15 minutes when the token silently refreshes. The live token is read per
     * connection attempt in the `auth` callback below instead.
     */
    const hasSession = Boolean(token);

    useEffect(() => {
        if (!hasSession) {
            setSocket(null);
            setIsConnected(false);
            return undefined;
        }

        let disposed = false;
        let authRecoveries = 0;
        let hasConnectedOnce = false;

        const connection = io(env.backendUrl, {
            /**
             * A function, not an object.
             *
             * socket.io-client evaluates this on *every* connection attempt,
             * including automatic reconnects, so a reconnect always presents
             * the token that is current at that moment. The previous
             * `auth: { token }` snapshot was captured once at mount, so any
             * reconnect after the 15-minute expiry handed the server a dead
             * token and was rejected — which is what made live updates stop
             * until the page was reloaded.
             */
            auth: (callback) => callback({ token: getAccessToken() }),
            /**
             * Start on polling and upgrade, which is the socket.io default and
             * the shape that survives proxies that do not forward the websocket
             * upgrade. Forcing websocket first meant that when the upgrade was
             * blocked the client gave up instead of falling back: since
             * socket.io-client 4.8 a failed first transport is not retried with
             * the next one unless `tryAllTransports` is set.
             */
            transports: ['polling', 'websocket'],
            tryAllTransports: true,
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 500,
            reconnectionDelayMax: 5000,
        });

        /** Prepends a transaction without duplicating one already in the list. */
        const prependTransaction = (transaction) => {
            if (!transaction) return;
            handlersRef.current.setRecentTransactions((current) => {
                if (current.some((item) => item._id === transaction._id)) return current;
                return [transaction, ...current].slice(0, RECENT_FETCH_LIMIT);
            });
        };

        /**
         * Pull the authoritative state back down.
         *
         * Called after every reconnect, and whenever the tab returns to the
         * foreground. Anything that moved while this client was not listening —
         * a transfer received during a sleeping laptop, a top-up confirmed by a
         * webhook — is invisible to a purely event-driven client, so the socket
         * carries live changes and this closes the gaps around them.
         */
        const resync = () => {
            handlersRef.current.fetchDashboardData().catch(() => {});
            handlersRef.current.refreshNotifications();
        };

        connection.on('connect', () => {
            setIsConnected(true);
            authRecoveries = 0;

            // The first connect happens right after AuthProvider has loaded the
            // profile, so only *re*connections need a resync.
            if (hasConnectedOnce) resync();
            hasConnectedOnce = true;
        });

        connection.on('disconnect', (reason) => {
            setIsConnected(false);

            // The server closing the socket (a restart, or an explicit
            // disconnect) does not trigger automatic reconnection — that is
            // left to the application, and previously nothing did it.
            if (reason === 'io server disconnect' && !disposed) {
                connection.connect();
            }
        });

        /**
         * An authentication failure is recoverable, and used to be fatal.
         *
         * The old handler called `disconnect()` on any auth error, which killed
         * the client permanently: no further attempts were ever made and the
         * only way back to live updates was a page reload. An expired access
         * token is the *expected* state here, not an error — so refresh it and
         * reconnect. Only a refresh that genuinely fails ends the attempt, and
         * the next authenticated request will sign the user out through the
         * normal 401 path.
         */
        connection.on('connect_error', async (error) => {
            setIsConnected(false);

            if (!/auth/i.test(error.message) || disposed) return;

            if (authRecoveries >= MAX_AUTH_RECOVERIES) {
                connection.disconnect();
                return;
            }
            authRecoveries += 1;

            try {
                const refreshed = await refreshSession();
                if (disposed) return;
                if (refreshed) connection.connect();
                else connection.disconnect();
            } catch {
                if (!disposed) connection.disconnect();
            }
        });

        // ---- money movement -------------------------------------------------

        // Balances arrive as `newBalanceMinor` (integer paise); `newBalance` in
        // rupees is the fallback for a server that predates it.
        const applyBalance = (data) => {
            const minor = newBalanceMinorOf(data);
            if (minor !== null) handlersRef.current.setBalanceMinor(minor);
        };

        connection.on('wallet_update', (data) => {
            applyBalance(data);
            prependTransaction(data.transaction);
            publish('wallet_update', data);

            const { category, type } = data.transaction ?? {};
            const amount = fromMinor(amountMinorOf(data.transaction));

            if (category === 'Transfer') {
                toast.success(
                    type === 'Debit'
                        ? `${formatAmount(amount)} sent`
                        : `${formatAmount(amount)} received`
                );
            } else if (category === 'Refund') {
                toast.success(`${formatAmount(amount)} refunded`);
            } else {
                toast.success('Balance updated');
            }
        });

        connection.on('deposit_success', (data) => {
            applyBalance(data);
            prependTransaction(data.transaction);
            publish('wallet_update', data);

            if (data.transaction) {
                toast.success(`${formatAmount(fromMinor(amountMinorOf(data.transaction)))} added to your wallet`);
            }
        });

        // ---- notifications --------------------------------------------------

        connection.on('notification_received', (data) => {
            handlersRef.current.refreshNotifications();
            // Pages that react to a decision (identity verification, Phase 5)
            // listen for it rather than polling.
            publish('notification_received', data);

            if (data.notification) {
                // Shared with the FCM foreground handler, which deduplicates on
                // the notification id: an open tab receives the same event over
                // both channels and used to toast it twice.
                handlersRef.current.showNotificationToast({
                    id: data.notification._id,
                    title: data.notification.title,
                    message: data.notification.message,
                });
            }
        });

        // ---- account --------------------------------------------------------

        connection.on('profile_updated', (data) => {
            if (!data.user) return;

            // Merge rather than replace: the socket payload is a projection of
            // a few fields, so assigning it wholesale would drop everything else
            // on the profile — including `preferences`, which the account
            // screen's toggles read from.
            handlersRef.current.setUser((current) => ({ ...current, ...data.user }));

            if (data.user.balanceMinor !== undefined || data.user.accountBalance !== undefined) {
                handlersRef.current.setBalanceMinor(balanceMinorOf(data.user));
            }
        });

        // ---- budgets & goals -------------------------------------------------

        /**
         * No AuthContext state to update here — budgets and goals are
         * page-scoped data owned by `useBudget`/`useGoals`' own `useQuery`
         * calls, not global state like balance. These events exist purely so
         * a page already on screen can refetch without polling.
         */
        connection.on('budget_update', (data) => publish('budget_update', data));
        connection.on('goal_update', (data) => publish('goal_update', data));

        connection.on('session_compromised', (data) => {
            toast.error(data.reason || 'Your session was ended for security reasons.', {
                duration: 8000,
            });
            handlersRef.current.logout();
        });

        /**
         * Foreground and connectivity recovery.
         *
         * A backgrounded tab gets its timers throttled and, on mobile, is
         * frozen outright — the socket dies quietly and the reconnect timer
         * does not run. Without this the user comes back to a page that looks
         * live and is not, which is exactly the state that makes someone
         * refresh to check their balance.
         */
        const handleWake = () => {
            if (disposed || document.visibilityState !== 'visible') return;
            if (!connection.connected) connection.connect();
            resync();
        };

        const handleOnline = () => {
            if (disposed) return;
            if (!connection.connected) connection.connect();
        };

        document.addEventListener('visibilitychange', handleWake);
        window.addEventListener('online', handleOnline);

        setSocket(connection);

        // `removeAllListeners()` covers every handler registered above — an
        // explicit list silently misses any event added later.
        return () => {
            disposed = true;
            document.removeEventListener('visibilitychange', handleWake);
            window.removeEventListener('online', handleOnline);
            connection.removeAllListeners();
            connection.disconnect();
        };
    }, [hasSession, publish]);

    const value = useMemo(
        () => ({ socket, isConnected, subscribe }),
        [socket, isConnected, subscribe]
    );

    return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};
