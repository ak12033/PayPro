import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import StatsCards from '../components/StatsCards';
import TransactionList from '../components/TransactionList';
import TransactionChart from '../components/TransactionChart';
import { useAuth } from '../context/AuthContext';
import { useEffect } from 'react';

const Dashboard = () => {

    const { balance, allTransactions, recentTransactions, fetchDashboardData } = useAuth();

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('token');
        navigate('/login');
    };

    const totalSent = allTransactions
        .filter((t) => t.type === 'Debit')
        .reduce((acc, t) => acc + Math.abs(t.amount), 0);

    const totalReceived = allTransactions
        .filter((t) => t.type === 'Credit' && t.category === 'Transfer')
        .reduce((acc, t) => acc + t.amount, 0);

    const totalAdded = allTransactions
        .filter((t) => t.category === 'Stripe')
        .reduce((acc, t) => acc + t.amount, 0);

    return (
        <div className="flex bg-gradient-to-br from-sky-950 via-sky-900 to-sky-950 min-h-screen">
            <div className="fixed top-0 left-0 h-screen w-64">
                <Sidebar />
            </div>
            <div className="p-8 flex-1 ml-64">
                <Topbar />
                <StatsCards
                    balance={balance}
                    totalTransactions={allTransactions.length}
                    totalSent={totalSent}
                    totalReceived={totalReceived}
                />
                <TransactionList transactions={recentTransactions} />
                <TransactionChart
                    sent={totalSent}
                    received={totalReceived}
                    added={totalAdded}
                />
            </div>
        </div>
    );
};

export default Dashboard;
