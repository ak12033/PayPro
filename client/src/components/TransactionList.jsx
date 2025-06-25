import React from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDate } from '../utils/formatDate';
import * as LucideIcons from 'lucide-react';

const TransactionList = ({ transactions }) => {
    
    const navigate = useNavigate();

    const getIcon = (iconName) => {
        const Icon = LucideIcons[iconName];
        return Icon ? <Icon size={20} /> : <LucideIcons.CircleDollarSign size={20} />; // fallback
    };

    const getIconBg = (t) => {
        if (t.type === 'Debit') {
            return 'from-red-400 to-red-600';
        }
        return 'from-green-400 to-green-600';
    };

    const getAmountColor = (t) => {
        return t.type === 'Debit' ? 'text-red-600' : 'text-green-600';
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">Recent Transactions</h2>
                <button
                    onClick={() => navigate('/transactions')}
                    className="text-cyan-400 hover:text-cyan-600 font-semibold transition-colors cursor-pointer"
                >
                    See All &rarr;
                </button>
            </div>

            {transactions.length > 0 ? (
                <div className="space-y-4 ">
                    {transactions.map((t) => (
                        <div
                            key={t._id}
                            className="flex items-center justify-between bg-gradient-to-br from-white/30 to-white/90 backdrop-blur-sm p-5 rounded-2xl shadow-lg hover:shadow-xl border border-gray-200 transition-transform duration-300 hover:-translate-y-1"
                        >
                            <div className="flex items-center gap-4">
                                <div
                                    className={`p-3 rounded-xl bg-gradient-to-br ${getIconBg(t)} text-white shadow`}
                                >
                                    {getIcon(t.icon)}
                                </div>
                                <div>
                                    <h3 className="text-lg font-medium text-gray-900">{t.description}</h3>
                                    <p className="text-xs text-gray-900">{formatDate(t.createdAt)}</p>
                                </div>
                            </div>

                            <div className={`text-lg font-bold ${getAmountColor(t)}`}>
                                ₹{t.amount}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-gray-200 text-sm">No transactions found.</p>
            )}
        </div>
    );
};

export default TransactionList;
