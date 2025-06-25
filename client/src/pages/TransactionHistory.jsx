import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../api/api.js';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const TransactionHistory = () => {
    const [transactions, setTransactions] = useState([]);
    const [filter, setFilter] = useState('All');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const { token } = useAuth();

    const fetchTransactions = async () => {
        try {
            const res = await api.get('/transactions/history', {
                headers: { Authorization: `Bearer ${token}` },
                params: {
                    page: currentPage,
                    limit: 5,
                    filter,
                },
            });

            setTransactions(res.data.transactions);
            setTotalPages(res.data.totalPages);
        } catch (err) {
            console.error(err);
            toast.error('Failed to fetch transactions.');
        }
    };

    useEffect(() => {
        fetchTransactions();
    }, [currentPage, filter]);

    return (
        <div className="flex min-h-screen bg-gradient-to-br from-sky-950 via-sky-900 to-sky-950 text-white">
            <div className="fixed top-0 left-0 h-screen w-64 bg-sky-900">
                <Sidebar />
            </div>
            <div className="p-8 flex-1 ml-64">
                <h1 className="text-3xl font-extrabold mb-8 tracking-tight">📄 Transaction History</h1>

                {/* Filter Buttons */}
                <div className="flex flex-wrap gap-3 mb-8">
                    {['All', 'Transfer', 'Received', 'Payment'].map((label) => (
                        <button
                            key={label}
                            onClick={() => {
                                setFilter(label);
                                setCurrentPage(1);
                            }}
                            className={`px-5 py-2 rounded-full font-medium transition duration-300 border ${filter === label
                                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg'
                                    : 'bg-white/10 text-gray-300 border-white/10 hover:bg-white/20'
                                }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {/* Transaction Table */}
                <div className="overflow-x-auto rounded-2xl shadow-2xl border border-white/10 backdrop-blur-lg bg-white/5">
                    <table className="w-full text-left text-gray-100">
                        <thead>
                            <tr className="bg-white/10">
                                <th className="p-4 border-b border-white/10">Type</th>
                                <th className="p-4 border-b border-white/10">Category</th>
                                <th className="p-4 border-b border-white/10">Amount</th>
                                <th className="p-4 border-b border-white/10">Date & Time</th>
                                <th className="p-4 border-b border-white/10">Invoice ID</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transactions.length > 0 ? (
                                transactions.map((t) => (
                                    <tr key={t._id} className="hover:bg-white/10 transition duration-200">
                                        <td className="p-4 border-b border-white/5">{t.type}</td>
                                        <td className="p-4 border-b border-white/5">{t.category}</td>
                                        <td
                                            className={`p-4 border-b border-white/5 font-semibold ${t.type === 'Debit' ? 'text-red-400' : 'text-green-400'
                                                }`}
                                        >
                                            ₹ {t.amount}
                                        </td>
                                        <td className="p-4 border-b border-white/5">
                                            <div>
                                                {new Date(t.createdAt).toLocaleDateString('en-GB', {
                                                    day: '2-digit',
                                                    month: 'long',
                                                    year: 'numeric',
                                                })}
                                            </div>
                                            <div className="text-xs text-gray-400">
                                                {new Date(t.createdAt).toLocaleTimeString('en-US', {
                                                    hour: 'numeric',
                                                    minute: '2-digit',
                                                    hour12: true,
                                                })}
                                            </div>
                                        </td>
                                        <td className="p-4 border-b border-white/5">{t.invoiceId}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="5" className="text-center p-6 text-gray-400">
                                        No transactions found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                <div className="flex justify-between items-center mt-6">
                    <button
                        onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="px-4 py-2 rounded bg-white/10 hover:bg-white/20 transition disabled:opacity-40"
                    >
                        ⬅ Previous
                    </button>
                    <div className="text-gray-300 text-sm">
                        Page {currentPage} of {totalPages}
                    </div>
                    <button
                        onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                        className="px-4 py-2 rounded bg-white/10 hover:bg-white/20 transition disabled:opacity-40"
                    >
                        Next ➡
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TransactionHistory;
