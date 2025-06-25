import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../api/api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const Transaction2FA = () => {
    const [otp, setOtp] = useState('');
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);

    const { state } = useLocation();
    const navigate = useNavigate();
    const { token } = useAuth();

    const verify = async () => {
        try {
            setLoading(true);

            // Verify OTP
            await api.post('/transactions/verify-otp', {
                email: state.email,
                otp,
            });

            toast.success('OTP verified! Processing your transaction...');

            // Retrieve pending transfer from localStorage
            const pendingTransfer = JSON.parse(localStorage.getItem('pendingTransfer'));

            if (!pendingTransfer) {
                toast.error('No pending transaction found');
                return;
            }

            // Proceed with transaction after OTP verified
            await api.post(
                '/transactions/transfer',
                {
                    recipientId: pendingTransfer.recipientId,
                    amount: pendingTransfer.amount,
                    skip2FA: true,
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            toast.success('Transfer completed successfully!');

            // Clear pending transfer
            localStorage.removeItem('pendingTransfer');

            // Navigate to transactions page
            navigate('/transactions');

        } catch (err) {
            toast.error(err.response?.data?.message || 'Verification or transfer failed');
        } finally {
            setLoading(false);
        }
    };

    const resendOtp = async () => {
        try {
            setResending(true);
            await api.post('/transactions/resend-otp', { email: state.email });
            toast.success('OTP resent successfully!');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to resend OTP');
        } finally {
            setResending(false);
        }
    };

    useEffect(() => {
        if (!state?.email) {
            navigate('/login');
        }
    }, [state, navigate]);

    return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-sky-950 to-sky-900 text-white">
            <div className="max-w-md w-full bg-white/10 p-8 rounded-2xl border border-white/20 shadow-lg space-y-6">
                <h1 className="text-3xl font-bold text-center">🔐 Verify OTP</h1>

                <input
                    type="text"
                    className="w-full px-4 py-3 rounded-xl border border-white/20 bg-white/5 text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-400 outline-none transition"
                    placeholder="Enter 6-digit OTP"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                />

                <button
                    onClick={verify}
                    disabled={loading}
                    className="w-full py-3 px-6 bg-gradient-to-tr from-green-400 to-green-600 hover:from-green-500 hover:to-green-700 text-white font-semibold rounded-xl shadow-lg transition-all duration-300 disabled:opacity-50"
                >
                    {loading ? 'Verifying...' : 'Verify and Complete Transfer'}
                </button>

                <button
                    onClick={resendOtp}
                    disabled={resending}
                    className="w-full py-3 px-6 bg-gradient-to-tr from-cyan-400 to-blue-600 hover:from-cyan-500 hover:to-blue-700 text-white font-semibold rounded-xl shadow-lg transition-all duration-300 disabled:opacity-50"
                >
                    {resending ? 'Resending...' : 'Resend OTP'}
                </button>
            </div>
        </div>
    );
};

export default Transaction2FA;
