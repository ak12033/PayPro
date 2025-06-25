import React, { useState } from 'react';
import api from '../api/api.js';
import Sidebar from '../components/Sidebar';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const AddTransaction = () => {
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const { token, fetchDashboardData } = useAuth();

    const addTransaction = async () => {
        if (!description || !amount) {
            toast.error('Please fill out both fields.');
            return;
        }

        try {
            setLoading(true);
            await api.post(
                '/transactions/add',
                { description, amount },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success('Transaction successfully added!');
            setDescription('');
            setAmount('');

            await fetchDashboardData();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to add transaction.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen bg-gradient-to-br from-sky-950 via-sky-900 to-sky-950 text-white">
            <Sidebar />
            <div className="flex-1 p-10">
                <h1 className="text-4xl font-bold mb-10 tracking-tight">➕ Add Transaction</h1>

                <div className="max-w-xl mx-auto bg-white/10 backdrop-blur-2xl border border-white/20 rounded-3xl shadow-2xl p-10 space-y-8">
                    <div>
                        <label className="block text-lg font-medium text-gray-200 mb-2">Description</label>
                        <input
                            className="w-full border border-white/20 rounded-xl p-4 bg-white/5 text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-400 outline-none transition"
                            placeholder="e.g. Grocery Shopping"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-lg font-medium text-gray-200 mb-2">Amount (₹)</label>
                        <input
                            type="number"
                            className="w-full border border-white/20 rounded-xl p-4 bg-white/5 text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-400 outline-none transition"
                            placeholder="e.g. 1200"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                        />
                    </div>

                    <button
                        onClick={addTransaction}
                        disabled={loading}
                        className={`w-full flex items-center justify-center gap-2 py-3 px-6 
            ${loading ? 'bg-green-600 cursor-not-allowed' : 'bg-gradient-to-tr from-green-400 to-green-600 hover:from-green-500 hover:to-green-700'}
            text-white font-semibold rounded-xl shadow-lg transition-all duration-300`}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="animate-spin" size={18} />
                                Processing...
                            </>
                        ) : (
                            <>
                                ➕ Add Transaction
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AddTransaction;
