import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
    FaHome,
    FaExchangeAlt,
    FaPlusCircle,
    FaHistory,
    FaWallet,
} from 'react-icons/fa';

const Sidebar = () => {
    const location = useLocation();

    const menuItems = [
        { label: 'Dashboard', route: '/dashboard', icon: <FaHome /> },
        { label: 'P2P Transfer', route: '/p2p-transfer', icon: <FaExchangeAlt /> },
        { label: 'Add Transaction', route: '/add-transaction', icon: <FaPlusCircle /> },
        { label: 'Transaction History', route: '/transactions', icon: <FaHistory /> },
        { label: 'Add Money', route: '/add-money', icon: <FaWallet /> },
    ];

    return (
        <div className="w-64 bg-white/80 backdrop-blur-md p-6 h-screen shadow-lg rounded-r-3xl flex flex-col justify-between">
            <div>
                <h2 className="text-2xl font-bold text-gray-800 mb-8">💸 PayPro</h2>

                <ul className="space-y-3">
                    {menuItems.map((item, index) => (
                        <li key={index}>
                            <Link
                                to={item.route}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${location.pathname === item.route
                                    ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow'
                                    : 'text-gray-700 hover:bg-gray-100'
                                    }`}
                            >
                                <span className="text-lg">{item.icon}</span>
                                <span className="text-base font-medium">{item.label}</span>
                            </Link>
                        </li>
                    ))}
                </ul>
            </div>

            <p className="text-sm text-gray-400 text-center">© 2025 PayPro</p>
        </div>
    );
};

export default Sidebar;
