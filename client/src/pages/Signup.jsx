import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/api.js';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const Signup = () => {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const navigate = useNavigate();
    const { setToken } = useAuth();

    const handleSignup = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await api.post('/auth/signup', { firstName, lastName, email, password });

            setToken(res.data.token);
            toast.success('Account created successfully!');
            navigate('/dashboard');

        } catch (err) {
            setError(err.response?.data?.message || 'Signup failed.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] p-6">
            <div className="max-w-md w-full bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 shadow-xl">
                <h1 className="text-3xl font-bold mb-8 text-center text-white">Create an Account</h1>

                <div className="space-y-5">
                    <input
                        className="w-full px-4 py-3 rounded-xl border border-white/20 bg-white/5 placeholder-gray-400 text-white focus:ring-2 focus:ring-cyan-400 outline-none"
                        placeholder="First Name"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                    />

                    <input
                        className="w-full px-4 py-3 rounded-xl border border-white/20 bg-white/5 placeholder-gray-400 text-white focus:ring-2 focus:ring-cyan-400 outline-none"
                        placeholder="Last Name"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                    />

                    <input
                        type="email"
                        className="w-full px-4 py-3 rounded-xl border border-white/20 bg-white/5 placeholder-gray-400 text-white focus:ring-2 focus:ring-cyan-400 outline-none"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />

                    <input
                        type="password"
                        className="w-full px-4 py-3 rounded-xl border border-white/20 bg-white/5 placeholder-gray-400 text-white focus:ring-2 focus:ring-cyan-400 outline-none"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />

                    {error && <p className="text-red-400 text-sm">{error}</p>}

                    <button
                        onClick={handleSignup}
                        disabled={loading}
                        className="w-full bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-500 hover:to-blue-600 text-gray-900 font-semibold py-3 rounded-xl shadow hover:shadow-lg transition-all duration-300 disabled:opacity-60"
                    >
                        {loading ? 'Signing up...' : 'Signup'}
                    </button>

                    <p className="text-sm text-gray-300 text-center mt-4">
                        Already have an account?{' '}
                        <span
                            onClick={() => navigate('/login')}
                            className="text-cyan-400 font-semibold cursor-pointer hover:underline"
                        >
                            Login
                        </span>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Signup;
