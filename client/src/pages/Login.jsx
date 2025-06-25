import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPublicIP } from '../utils/getPublicIP.js';
import api from '../api/api.js';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const { setToken } = useAuth(); 

    const handleLogin = async () => {
        setLoading(true);
        setError('');
        try {
            const ip = await getPublicIP();
            const res = await api.post('/auth/login', { email, password, ip });

            // Update token in context (and internally it stays in localStorage via your existing context logic)
            setToken(res.data.token);
            localStorage.setItem('token', res.data.token)
            toast.success('Login successful!');
            navigate('/dashboard');

        } catch (err) {
            if (err.response?.status === 403) {
                toast('New login location detected. OTP sent!');
                navigate('/verify-login-otp', { state: { email } });
            } else {
                setError('Invalid email or password');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-900 via-sky-800 to-sky-900 text-white p-6">
            <div className="max-w-md w-full bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 shadow-xl">
                <h1 className="text-3xl font-bold mb-8 text-center text-white">🔐 Login</h1>

                <div className="space-y-5">
                    <input
                        className="w-full px-4 py-3 rounded-lg border border-white/20 bg-white/10 placeholder-gray-300 text-white focus:ring-2 focus:ring-cyan-400 outline-none"
                        placeholder="Email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />

                    <input
                        className="w-full px-4 py-3 rounded-lg border border-white/20 bg-white/10 placeholder-gray-300 text-white focus:ring-2 focus:ring-cyan-400 outline-none"
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />

                    {error && (
                        <div className="flex items-center gap-3 bg-red-500/20 text-red-200 border border-red-400/30 px-4 py-3 rounded-lg text-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-1.414 1.414M5.636 18.364l1.414-1.414M7.05 7.05l9.9 9.9M7.05 16.95l9.9-9.9" />
                            </svg>
                            {error}
                        </div>
                    )}

                    <button
                        onClick={handleLogin}
                        disabled={loading}
                        className="w-full bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-500 hover:to-blue-600 text-gray-900 font-semibold py-3 rounded-lg shadow transition-all duration-300 disabled:opacity-60"
                    >
                        {loading ? 'Logging in...' : 'Login'}
                    </button>

                    <p className="text-sm text-gray-300 text-center mt-4">
                        Don't have an account?{' '}
                        <span
                            onClick={() => navigate('/signup')}
                            className="text-cyan-400 font-semibold cursor-pointer hover:underline"
                        >
                            Sign up
                        </span>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;
