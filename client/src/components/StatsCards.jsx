import React from 'react';
import { FaWallet, FaExchangeAlt, FaArrowUp, FaArrowDown } from 'react-icons/fa';

const StatsCards = ({ balance, totalTransactions, totalSent, totalReceived }) => {

    const cardStyles = "p-6 rounded-2xl shadow-xl hover:scale-[1.02] transition-transform border border-white/20 backdrop-blur-lg bg-gradient-to-br from-white/70 to-white/30";

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
            <div className={cardStyles}>
                <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-gradient-to-br from-green-400 to-green-600 text-white rounded-full shadow">
                        <FaWallet size={22} />
                    </div>
                    <p className="text-sm font-medium text-gray-600">Current Balance</p>
                </div>
                <h2 className="text-3xl font-bold text-gray-800">₹{balance}</h2>
            </div>

            <div className={cardStyles}>
                <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-gradient-to-br from-blue-400 to-blue-600 text-white rounded-full shadow">
                        <FaExchangeAlt size={22} />
                    </div>
                    <p className="text-sm font-medium text-gray-600">Total Transactions</p>
                </div>
                <h2 className="text-3xl font-bold text-gray-800">{totalTransactions}</h2>
            </div>

            <div className={cardStyles}>
                <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-gradient-to-br from-red-400 to-red-600 text-white rounded-full shadow">
                        <FaArrowUp size={22} />
                    </div>
                    <p className="text-sm font-medium text-gray-600">Total Sent</p>
                </div>
                <h2 className="text-3xl font-bold text-gray-800">₹{totalSent}</h2>
            </div>

            <div className={cardStyles}>
                <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-gradient-to-br from-purple-400 to-purple-600 text-white rounded-full shadow">
                        <FaArrowDown size={22} />
                    </div>
                    <p className="text-sm font-medium text-gray-600">Total Received</p>
                </div>
                <h2 className="text-3xl font-bold text-gray-800">₹{totalReceived}</h2>
            </div>
        </div>
    );
};

export default StatsCards;
