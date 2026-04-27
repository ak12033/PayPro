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
        <div className="flex min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.10),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.10),_transparent_28%),linear-gradient(135deg,#06101d_0%,#0b1728_45%,#091423_100%)] text-white">
            <div className="fixed top-0 left-0 h-screen w-64 border-r border-white/10 bg-white/[0.03] backdrop-blur-2xl">
                <Sidebar />
            </div>
            <div className="ml-64 flex-1 p-4 sm:p-6 lg:p-8 xl:p-10">
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