import React, { useEffect, useState } from 'react';
import api from '../api/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';

const PaymentHistory = () => {
    const { token } = useAuth();
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchPayments = async () => {
            try {
                const res = await api.get('/payments/history', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.data.success) {
                    setPayments(res.data.payments);
                }
            } catch (err) {
                console.error('Error fetching payments:', err);
                toast.error('Failed to load payment history');
            } finally {
                setLoading(false);
            }
        };

        if (token) {
            fetchPayments();
        }
    }, [token]);

    const getStatusColor = (status) => {
        switch(status) {
            case 'captured': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
            case 'created': return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
            case 'failed': return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
            case 'refunded': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
            default: return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
        }
    };

    return (
        <>
            <div className="mx-auto max-w-6xl">
                        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                                <p className="mb-2 text-xs font-medium uppercase tracking-[0.24em] text-cyan-300/75">
                                    Wallet History
                                </p>
                                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                                    Top-ups & Refunds
                                </h1>
                                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
                                    View your entire Razorpay payment history, status of recent top-ups, and processed refunds.
                                </p>
                            </div>
                        </div>

                        <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-8">
                            {loading ? (
                                <div className="flex h-40 items-center justify-center">
                                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
                                </div>
                            ) : payments.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center">
                                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/5 border border-white/10">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                        </svg>
                                    </div>
                                    <h3 className="text-lg font-medium text-white">No payments yet</h3>
                                    <p className="mt-2 text-sm text-slate-400">Your wallet top-up history will appear here.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full whitespace-nowrap text-left text-sm">
                                        <thead className="border-b border-white/10 text-slate-400">
                                            <tr>
                                                <th className="pb-4 font-medium px-4">Date</th>
                                                <th className="pb-4 font-medium px-4">Order ID</th>
                                                <th className="pb-4 font-medium px-4">Amount</th>
                                                <th className="pb-4 font-medium px-4">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {payments.map((payment) => (
                                                <tr key={payment._id} className="transition-colors hover:bg-white/[0.02]">
                                                    <td className="py-4 px-4 text-slate-300">
                                                        {new Date(payment.createdAt).toLocaleDateString('en-IN', {
                                                            day: 'numeric',
                                                            month: 'short',
                                                            year: 'numeric',
                                                            hour: '2-digit',
                                                            minute: '2-digit'
                                                        })}
                                                    </td>
                                                    <td className="py-4 px-4 font-mono text-xs text-slate-400">
                                                        {payment.orderId}
                                                    </td>
                                                    <td className="py-4 px-4 font-semibold text-white">
                                                        ₹{payment.amount.toLocaleString('en-IN')}
                                                    </td>
                                                    <td className="py-4 px-4">
                                                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${getStatusColor(payment.status)}`}>
                                                            {payment.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
            </div>
        </>
    );
};

export default PaymentHistory;
