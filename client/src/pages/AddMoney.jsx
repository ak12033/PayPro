import React, { useMemo, useState, useEffect } from 'react';
import api from '../api/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';

const loadRazorpayScript = () => {
    return new Promise((resolve) => {
        if (window.Razorpay) {
            resolve(true);
            return;
        }
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
    });
};

const AddMoney = () => {
    const { token, fetchDashboardData } = useAuth();
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);
    
    const quickAmounts = [500, 1000, 2000, 5000];
    const numericAmount = Number(amount);
    const isValidAmount = numericAmount > 0;

    const fee = useMemo(() => {
        if (!isValidAmount) return 0;
        return 0; // Razorpay fees could be calculated here if passed to user
    }, [isValidAmount]);

    const total = useMemo(() => {
        if (!isValidAmount) return 0;
        return numericAmount + fee;
    }, [numericAmount, fee, isValidAmount]);

    useEffect(() => {
        loadRazorpayScript();
    }, []);

    const handlePayment = async () => {
        if (!isValidAmount) return;

        try {
            setLoading(true);
            
            const isLoaded = await loadRazorpayScript();
            if (!isLoaded) {
                toast.error('Failed to load Razorpay SDK. Check your connection.');
                setLoading(false);
                return;
            }

            // Create order on backend
            const { data: orderData } = await api.post('/payments/create-order', 
                { amount: total },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (!orderData.success) {
                toast.error('Could not create order');
                setLoading(false);
                return;
            }

            const options = {
                key: import.meta.env.VITE_RAZORPAY_KEY_ID,
                amount: orderData.amount,
                currency: orderData.currency,
                name: 'PayPro',
                description: 'Wallet Top-up',
                order_id: orderData.orderId,
                handler: async function (response) {
                    try {
                        const verifyData = await api.post('/payments/verify', {
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                        }, { headers: { Authorization: `Bearer ${token}` } });

                        if (verifyData.data.success) {
                            toast.success(`Successfully added ₹${numericAmount} to wallet!`);
                            fetchDashboardData();
                            setAmount('');
                        } else {
                            toast.error('Payment verification failed');
                        }
                    } catch (err) {
                        console.error('Verify error:', err);
                        toast.error(err.response?.data?.message || 'Verification error');
                    }
                },
                prefill: {
                    name: '',
                    email: '',
                    contact: ''
                },
                theme: {
                    color: '#08111e'
                }
            };

            const rzp = new window.Razorpay(options);
            
            rzp.on('payment.failed', function (response) {
                toast.error(`Payment failed: ${response.error.description}`);
            });

            rzp.open();

        } catch (error) {
            console.error('Payment Error:', error);
            toast.error(error.response?.data?.message || 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <div className="mx-auto max-w-6xl">
                        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                                <p className="mb-2 text-xs font-medium uppercase tracking-[0.24em] text-cyan-300/75">
                                    Wallet funding
                                </p>
                                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                                    Add money
                                </h1>
                                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
                                    Top up your balance securely using Razorpay and continue payments without interruption.
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-row">
                                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                                        Payment gateway
                                    </p>
                                    <p className="mt-1 text-sm font-medium text-white">Razorpay</p>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                                        Status
                                    </p>
                                    <p className="mt-1 text-sm font-medium text-emerald-300">Secure</p>
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                            <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-8">
                                <div className="mb-8 flex items-start justify-between gap-4">
                                    <div>
                                        <h2 className="text-xl font-semibold text-white">Choose amount</h2>
                                        <p className="mt-2 text-sm leading-6 text-slate-400">
                                            Enter the amount you want to add or pick a quick preset.
                                        </p>
                                    </div>

                                    <div className="hidden h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-300 sm:flex">
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            className="h-7 w-7"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth={1.8}
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M12 8c-2.21 0-4 1.12-4 2.5S9.79 13 12 13s4 1.12 4 2.5S14.21 18 12 18s-4-1.12-4-2.5M12 6v12"
                                            />
                                        </svg>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label
                                            htmlFor="amount"
                                            className="block text-sm font-medium text-slate-200"
                                        >
                                            Enter amount
                                        </label>

                                        <div className="flex items-center rounded-xl border border-white/10 bg-white/[0.04] px-4 transition-all duration-200 focus-within:border-cyan-300/50 focus-within:bg-white/[0.06] focus-within:shadow-[0_0_0_4px_rgba(34,211,238,0.08)]">
                                            <span className="mr-3 text-lg font-semibold text-cyan-300">₹</span>
                                            <input
                                                id="amount"
                                                type="number"
                                                min="1"
                                                placeholder="Enter amount"
                                                className="w-full bg-transparent py-4 text-[15px] text-white placeholder:text-slate-500 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                                value={amount}
                                                onChange={(e) => setAmount(e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <p className="mb-3 text-sm font-medium text-slate-300">
                                            Quick select
                                        </p>
                                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                            {quickAmounts.map((value) => {
                                                const active = Number(amount) === value;

                                                return (
                                                    <button
                                                        key={value}
                                                        type="button"
                                                        onClick={() => setAmount(String(value))}
                                                        className={`rounded-2xl border px-4 py-3 text-sm font-medium transition-all duration-200 ${active
                                                            ? 'border-cyan-300/40 bg-cyan-400/12 text-cyan-300 shadow-[0_0_0_4px_rgba(34,211,238,0.08)]'
                                                            : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.07] hover:text-white'
                                                            }`}
                                                    >
                                                        ₹{value}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="grid gap-4 sm:grid-cols-3">
                                        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                                                Amount
                                            </p>
                                            <p className="mt-2 text-xl font-semibold text-white">
                                                ₹{isValidAmount ? numericAmount.toLocaleString('en-IN') : '0'}
                                            </p>
                                        </div>

                                        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                                                Fee
                                            </p>
                                            <p className="mt-2 text-xl font-semibold text-white">
                                                ₹{fee.toLocaleString('en-IN')}
                                            </p>
                                        </div>

                                        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                                                Total
                                            </p>
                                            <p className="mt-2 text-xl font-semibold text-cyan-300">
                                                ₹{total.toLocaleString('en-IN')}
                                            </p>
                                        </div>
                                    </div>

                                    {isValidAmount && (
                                        <div className="mt-6">
                                            <button
                                                onClick={handlePayment}
                                                disabled={loading}
                                                className={`w-full rounded-2xl py-4 text-base font-semibold transition-all duration-200 ${loading ? 'bg-cyan-500/50 cursor-not-allowed text-white/70' : 'bg-cyan-500 hover:bg-cyan-400 text-[#08111e]'}`}
                                            >
                                                {loading ? 'Processing...' : `Proceed to Pay ₹${total.toLocaleString('en-IN')}`}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                                    <p className="text-xs font-medium uppercase tracking-[0.22em] text-cyan-300/75">
                                        Funding summary
                                    </p>

                                    <div className="mt-5 rounded-3xl border border-white/10 bg-[linear-gradient(135deg,rgba(103,232,249,0.16),rgba(59,130,246,0.12))] p-5">
                                        <p className="text-sm text-slate-300">You are adding</p>
                                        <p className="mt-3 text-4xl font-semibold tracking-tight text-white">
                                            ₹{isValidAmount ? numericAmount.toLocaleString('en-IN') : '0'}
                                        </p>
                                        <p className="mt-2 text-sm text-slate-400">
                                            Instant top-up for your wallet balance.
                                        </p>
                                    </div>

                                    <div className="mt-5 space-y-4">
                                        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                                            <span className="text-sm text-slate-400">Processing fee</span>
                                            <span className="text-sm font-medium text-white">₹0</span>
                                        </div>

                                        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                                            <span className="text-sm text-slate-400">Settlement</span>
                                            <span className="text-sm font-medium text-white">Instant</span>
                                        </div>

                                        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                                            <span className="text-sm text-slate-400">Gateway</span>
                                            <span className="text-sm font-medium text-white">Razorpay</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                                    <p className="text-xs font-medium uppercase tracking-[0.22em] text-cyan-300/75">
                                        Helpful notes
                                    </p>

                                    <div className="mt-5 space-y-4">
                                        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                            <h3 className="text-sm font-medium text-white">Use preset amounts</h3>
                                            <p className="mt-2 text-sm leading-6 text-slate-400">
                                                Quick-select options make repeat top-ups faster and more consistent.
                                            </p>
                                        </div>

                                        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                            <h3 className="text-sm font-medium text-white">Enter any custom amount</h3>
                                            <p className="mt-2 text-sm leading-6 text-slate-400">
                                                You can type the exact amount you want before completing payment.
                                            </p>
                                        </div>

                                        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                            <h3 className="text-sm font-medium text-white">Secure checkout</h3>
                                            <p className="mt-2 text-sm leading-6 text-slate-400">
                                                Payment details are handled securely through Razorpay's encrypted gateway.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
            </div>
        </>
    );
};

export default AddMoney;