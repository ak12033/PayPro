import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../api/api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const UpdateProfile = () => {
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
    });

    const { token, fetchDashboardData } = useAuth();

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await api.get('/users/profile', {
                    headers: { Authorization: `Bearer ${token}` },
                });
                setFormData({
                    firstName: res.data.firstName,
                    lastName: res.data.lastName,
                    email: res.data.email,
                    password: '',
                });
            } catch (err) {
                console.error(err);
                toast.error('Failed to fetch profile data.');
            }
        };

        fetchProfile();
    }, [token]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await api.put('/users/update-profile', formData, {
                headers: { Authorization: `Bearer ${token}` },
            });
            toast.success('Profile updated successfully!');
            fetchDashboardData();
        } catch (err) {
            console.error(err);
            toast.error(err.response?.data?.message || 'Failed to update profile.');
        }
    };

    return (
        <div className="flex min-h-screen bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] text-white">
            <Sidebar />

            <div className="flex-1 p-8">
                <h1 className="text-4xl font-bold mb-10">⚙️ Update Profile</h1>

                <form
                    onSubmit={handleSubmit}
                    className="max-w-lg bg-white/5 rounded-3xl p-10 space-y-6 shadow-2xl border border-white/20 backdrop-blur-lg"
                >
                    <div>
                        <label className="block mb-2 font-medium">First Name</label>
                        <input
                            name="firstName"
                            value={formData.firstName}
                            onChange={handleChange}
                            className="w-full p-4 rounded-lg bg-white/10 text-white border border-white/20 outline-none"
                            type="text"
                        />
                    </div>

                    <div>
                        <label className="block mb-2 font-medium">Last Name</label>
                        <input
                            name="lastName"
                            value={formData.lastName}
                            onChange={handleChange}
                            className="w-full p-4 rounded-lg bg-white/10 text-white border border-white/20 outline-none"
                            type="text"
                        />
                    </div>

                    <div>
                        <label className="block mb-2 font-medium">Email</label>
                        <input
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            className="w-full p-4 rounded-lg bg-white/10 text-white border border-white/20 outline-none"
                            type="email"
                        />
                    </div>

                    <div>
                        <label className="block mb-2 font-medium">New Password (optional)</label>
                        <input
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            className="w-full p-4 rounded-lg bg-white/10 text-white border border-white/20 outline-none"
                            type="password"
                        />
                    </div>

                    <button
                        type="submit"
                        className="w-full bg-gradient-to-r from-cyan-400 to-blue-500 text-gray-900 font-semibold py-3 rounded-lg shadow hover:from-cyan-500 hover:to-blue-600 transition-all duration-300"
                    >
                        Save Changes
                    </button>
                </form>
            </div>
        </div>
    );
};

export default UpdateProfile;
