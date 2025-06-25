import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/api';
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [userName, setUserName] = useState('');
    const [balance, setBalance] = useState(0);
    const [allTransactions, setAllTransactions] = useState([]);
    const [recentTransactions, setRecentTransactions] = useState([]);
    const navigate = useNavigate();

    useEffect(() => {
        if (token) {
            fetchDashboardData();
        }
    }, [token]);

    const fetchDashboardData = async () => {
        try {
            const userRes = await api.get('/users/profile', {
                headers: { Authorization: `Bearer ${token}` },
            });
            setBalance(userRes.data.accountBalance);
            setUserName(userRes.data.firstName);

            const transRes = await api.get('/transactions/recent', {
                headers: { Authorization: `Bearer ${token}` },
            });
            setRecentTransactions(transRes.data.transactions.slice(0, 6));
            setAllTransactions(transRes.data.transactions);
        } catch (err) {
            console.error('Error fetching dashboard data:', err);
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        setToken(null);
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
                balance,
                allTransactions,
                recentTransactions,
                fetchDashboardData,
                logout,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};
