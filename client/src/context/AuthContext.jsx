import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/api';
import { useNavigate, useLocation } from 'react-router-dom';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [token, setTokenState] = useState(null); // Just a react-friendly representation of auth state
    const [userName, setUserName] = useState('');
    const [balance, setBalance] = useState(0);
    const [allTransactions, setAllTransactions] = useState([]);
    const [recentTransactions, setRecentTransactions] = useState([]);
    const [isCheckingAuth, setIsCheckingAuth] = useState(true);
    
    const navigate = useNavigate();
    const location = useLocation();

    // Helper to sync memory token with React state
    const setToken = (newToken) => {
        window.accessToken = newToken;
        setTokenState(newToken);
    };

    useEffect(() => {
        const initAuth = async () => {
            try {
                await fetchDashboardData();
            } catch (err) {
                // If it fails even after silent refresh, we are truly logged out
                setTokenState(null);
            } finally {
                setIsCheckingAuth(false);
            }
        };

        initAuth();

        // Listen for expiration events from the interceptor
        const handleAuthExpired = () => {
            setTokenState(null);
            setUserName('');
            setBalance(0);
            if (location.pathname !== '/login' && location.pathname !== '/signup') {
                navigate('/login');
            }
        };

        window.addEventListener('auth-expired', handleAuthExpired);
        return () => window.removeEventListener('auth-expired', handleAuthExpired);
    }, []);

    // Also fetch data if token state changes directly (e.g. after login)
    useEffect(() => {
        if (token && !userName) {
            fetchDashboardData();
        }
    }, [token]);

    const fetchDashboardData = async () => {
        try {
            const userRes = await api.get('/users/profile');
            setBalance(userRes.data.accountBalance);
            setUserName(userRes.data.firstName);
            
            // If the interceptor successfully refreshed the token, sync it back to React state
            if (window.accessToken && window.accessToken !== token) {
                setTokenState(window.accessToken);
            }

            const transRes = await api.get('/transactions/recent');
            setRecentTransactions(transRes.data.transactions.slice(0, 6));
            setAllTransactions(transRes.data.transactions);
        } catch (err) {
            console.error('Error fetching dashboard data:', err);
            throw err;
        }
    };

    const logout = async () => {
        try {
            await api.post('/auth/logout');
        } catch (e) {
            console.error('Logout error', e);
        }
        window.accessToken = null;
        setTokenState(null);
        setUserName('');
        setBalance(0);
        navigate('/login');
    };

    return (
        <AuthContext.Provider
            value={{
                token,
                setToken,
                userName,
                setUserName,
                balance,
                setBalance,
                allTransactions,
                setAllTransactions,
                recentTransactions,
                setRecentTransactions,
                fetchDashboardData,
                logout,
                isCheckingAuth
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};
