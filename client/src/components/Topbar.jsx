import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiEdit, FiLogOut, FiUser } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';

const Topbar = () => {

    const { userName, logout } = useAuth();
    const navigate = useNavigate();

    return (
        <div className="relative z-50 flex justify-between items-center mb-8 p-6 rounded-2xl shadow-[0_8px_20px_rgba(0,0,0,0.05)]
      bg-gradient-to-r from-blue-500/80 via-cyan-400/70 to-sky-500/80 backdrop-blur-xl border border-white/20 transition-all duration-300">

            <div>
                <h1 className="text-3xl font-extrabold text-white drop-shadow">
                    Welcome, <span className="text-yellow-300">{userName}</span> 👋
                </h1>
            </div>

            <div className="flex items-center space-x-4 relative">
                <button
                    onClick={() => navigate('/add-money')}
                    className="bg-gradient-to-r from-yellow-400 to-orange-500 text-gray-900 px-5 py-2 rounded-xl font-semibold shadow hover:from-yellow-500 hover:to-orange-600 transition-all duration-300"
                >
                    + Add Money
                </button>

                <div className="relative group z-50">
                    <button className="p-3 rounded-full border border-white/30 bg-slate-500 text-white hover:bg-slate-700 transition-all duration-300">
                        <FiUser size={22} />
                    </button>

                    {/* Dropdown on hover */}
                    <div className="absolute right-0 top-14 w-56 bg-black backdrop-blur-2xl border border-white/20 rounded-2xl shadow-2xl py-2 opacity-0 invisible group-hover:visible group-hover:opacity-100 group-hover:translate-y-1 transition-all duration-300 z-50">

                        {/* Update Profile */}
                        <button
                            onClick={() => navigate('/update-profile')}
                            className="flex items-center gap-3 w-full text-left px-5 py-3 font-medium text-white hover:bg-gradient-to-r hover:text-black rounded-t-2xl transition-all duration-200 cursor-pointer hover:bg-gray-300"
                        >
                            <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-full shadow-md">
                                <FiEdit size={18} />
                            </div>
                            <span className="text-base">Update Profile</span>
                        </button>

                        <div className="border-t border-white/20 my-1"></div>

                        {/* Logout */}
                        <button
                            onClick={logout}
                            className="flex items-center gap-3 w-full text-left px-5 py-3 font-medium text-white hover:bg-gradient-to-r hover:text-black rounded-b-2xl transition-all duration-200 cursor-pointer hover:bg-gray-300"
                        >
                            <div className="p-2 bg-gradient-to-br from-rose-500 to-red-600 text-white rounded-full shadow-md">
                                <FiLogOut size={18} />
                            </div>
                            <span className="text-base">Logout</span>
                        </button>

                    </div>




                </div>
            </div>
        </div>
    );
};

export default Topbar;
