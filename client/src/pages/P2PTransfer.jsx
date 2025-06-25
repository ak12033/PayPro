import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../api/api.js';
import toast from 'react-hot-toast';
import { FiChevronDown, FiUser } from 'react-icons/fi';
import { ImSpinner2 } from 'react-icons/im';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const P2PTransfer = () => {
    const [users, setUsers] = useState([]);
    const [amount, setAmount] = useState('');
    const [recipientId, setRecipientId] = useState('');
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const navigate = useNavigate();
    const { token, fetchDashboardData } = useAuth();

    const fetchUsers = async () => {
        try {
            const res = await api.get('/users/all', {
                headers: { Authorization: `Bearer ${token}` },
            });
            setUsers(res.data.users);
        } catch (err) {
            toast.error('Failed to fetch users');
        }
    };

    const sendMoney = async () => {
        if (!amount || !recipientId) {
            toast.error('Please enter amount and select a user');
            return;
        }

        try {
            setLoading(true);

            const res = await api.post(
                '/transactions/transfer',
                { recipientId, amount },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            toast.success('Money sent successfully!');
            setAmount('');
            setRecipientId('');

            await fetchDashboardData();

        } catch (err) {
            if (err.response?.data?.require2FA) {
                localStorage.setItem(
                    'pendingTransfer',
                    JSON.stringify({ recipientId, amount })
                );
                toast.error(err.response.data.message);
                navigate('/verify-otp', { state: { email: err.response.data.email } });
                return;
            }

            toast.error(err.response?.data?.message || 'Transfer failed');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    return (
        <div className="flex min-h-screen bg-gradient-to-br from-sky-950 via-sky-900 to-sky-950 text-white">
            <div className="fixed top-0 left-0 h-screen w-64 bg-sky-900">
                <Sidebar />
            </div>
            <div className="flex-1 p-10 ml-64">
                <h1 className="text-4xl font-bold mb-10">💸 P2P Transfer</h1>

                <div className="max-w-xl mx-auto bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl rounded-3xl p-8 space-y-6">
                    <div>
                        <label className="block text-lg mb-2 text-gray-200">Amount (₹)</label>
                        <input
                            type="number"
                            placeholder="Enter amount"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-white/20 bg-white/10 text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-400 outline-none transition"
                        />
                    </div>

                    <div>
                        <label className="block text-lg mb-3 text-gray-200">Select Recipient</label>
                        <div
                            onClick={() => setDropdownOpen(!dropdownOpen)}
                            className="flex items-center justify-between w-full px-4 py-3 rounded-xl border border-white/20 bg-white/10 text-white cursor-pointer"
                        >
                            <span>
                                {recipientId
                                    ? `${users.find((u) => u._id === recipientId)?.firstName} ${users.find((u) => u._id === recipientId)?.lastName}`
                                    : '-- Select User --'}
                            </span>
                            <FiChevronDown className="text-gray-300" />
                        </div>

                        {dropdownOpen && (
                            <div className="mt-2 space-y-2 max-h-60 overflow-y-auto rounded-xl border border-white/20 bg-white/10 backdrop-blur-lg p-3 z-50">
                                {users.map((u) => (
                                    <div
                                        key={u._id}
                                        onClick={() => {
                                            setRecipientId(u._id);
                                            setDropdownOpen(false);
                                        }}
                                        className={`flex items-center gap-4 px-4 py-3 rounded-lg cursor-pointer transition-all duration-200 ${recipientId === u._id
                                                ? 'bg-gradient-to-r from-blue-300 to-blue-600 text-white shadow'
                                                : 'hover:bg-slate-700 text-gray-300'
                                            }`}
                                    >
                                        <div className="p-2 bg-gradient-to-br from-blue-600 to-blue-400 rounded-full shadow-md">
                                            <FiUser className="text-white" size={18} />
                                        </div>
                                        <div>
                                            <p className="font-medium">
                                                {u.firstName} {u.lastName}
                                            </p>
                                            <p className="text-sm text-gray-400">{u.email}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <button
                        onClick={sendMoney}
                        disabled={loading}
                        className="w-full flex justify-center items-center gap-3 bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-500 hover:to-blue-600 text-gray-900 font-semibold py-3 rounded-xl shadow hover:shadow-lg transition-all duration-300 disabled:opacity-50 cursor-pointer"
                    >
                        {loading ? (
                            <>
                                <ImSpinner2 className="animate-spin" size={20} />
                                Sending...
                            </>
                        ) : (
                            `Send ₹${amount || '...'}`
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default P2PTransfer;
