import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../api/api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const Login2FA = () => {
    const [otp, setOtp] = useState('');
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);
    const { state } = useLocation();
    const navigate = useNavigate();
    const { setToken } = useAuth(); 

    const verify = async () => {
        try {
            setLoading(true);
            const res = await api.post('/auth/verify-login-otp', {
                email: state.email,
                otp,
            });

            setToken(res.data.token);
            toast.success('Login successful!');
            navigate('/dashboard');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Verification failed');
        } finally {
            setLoading(false);
        }
    };

    const resendOtp = async () => {
        try {
            setResending(true);
            await api.post('/auth/resend-login-otp', { email: state.email });
            toast.success('OTP resent!');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to resend OTP');
        } finally {
            setResending(false);
        }
    };

    useEffect(() => {
        if (!state?.email) navigate('/login');
    }, [state, navigate]);

    return (
        <div className="flex items-center justify-center min-h-screen bg-sky-900 text-white">
            <div className="max-w-md w-full p-8 rounded-xl bg-white/10 border border-white/20 space-y-6">
                <h1 className="text-3xl font-bold text-center">🔐 Verify Login OTP</h1>
                <input
                    type="text"
                    className="w-full px-4 py-3 rounded border border-white/20 bg-white/5"
                    placeholder="Enter OTP"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                />
                <button
                    onClick={verify}
                    disabled={loading}
                    className="w-full py-3 bg-green-500 hover:bg-green-600 rounded"
                >
                    {loading ? 'Verifying...' : 'Verify OTP'}
                </button>
                <button
                    onClick={resendOtp}
                    disabled={resending}
                    className="w-full py-3 bg-blue-500 hover:bg-blue-600 rounded"
                >
                    {resending ? 'Resending...' : 'Resend OTP'}
                </button>
            </div>
        </div>
    );
};

export default Login2FA;
