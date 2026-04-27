import React, { useMemo, useState } from 'react';
import Sidebar from '../components/Sidebar';
import CheckoutForm from '../components/stripe/CheckoutForm';
import { Elements } from '@stripe/react-stripe-js';
import { stripePromise } from '../stripe/stripe';

const AddMoney = () => {
    const [amount, setAmount] = useState('');
    const quickAmounts = [500, 1000, 2000, 5000];

    const numericAmount = Number(amount);
    const isValidAmount = numericAmount > 0;

    const fee = useMemo(() => {
        if (!isValidAmount) return 0;
        return 0;
    }, [isValidAmount]);

    const total = useMemo(() => {
        if (!isValidAmount) return 0;
        return numericAmount + fee;
    }, [numericAmount, fee, isValidAmount]);

    return (
        <div className="flex min-h-screen bg-[#07111f] text-white">
            <Sidebar />

            <div className="relative flex-1 overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.10),_transparent_26%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.08),_transparent_28%),linear-gradient(180deg,#08111e_0%,#0b1626_100%)]" />
                <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:72px_72px]" />

                <div className="relative z-10 h-screen overflow-y-auto px-5 py-6 sm:px-8 lg:px-10">
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
                                    Top up your balance securely using Stripe and continue payments without interruption.
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-row">
                                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                                        Payment gateway
                                    </p>
                                    <p className="mt-1 text-sm font-medium text-white">Stripe</p>
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

                                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                                        <div className="flex items-start gap-3">
                                            <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    className="h-5 w-5"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke="currentColor"
                                                    strokeWidth={1.8}
                                                >
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        d="M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7l7-4z"
                                                    />
                                                </svg>
                                            </div>

                                            <div>
                                                <h3 className="text-sm font-medium text-white">
                                                    Protected top-up flow
                                                </h3>
                                                <p className="mt-1 text-sm leading-6 text-slate-400">
                                                    Your payment is processed through a secure Stripe checkout experience.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {isValidAmount && (
                                        <div className="rounded-[24px] border border-white/10 bg-[#08111d]/80 p-5 sm:p-6">
                                            <div className="mb-4">
                                                <h3 className="text-lg font-semibold text-white">
                                                    Complete payment
                                                </h3>
                                                <p className="mt-1 text-sm text-slate-400">
                                                    Review the amount and finish your secure payment below.
                                                </p>
                                            </div>

                                            <Elements stripe={stripePromise}>
                                                <CheckoutForm amount={amount} />
                                            </Elements>
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
                                            <span className="text-sm font-medium text-white">Stripe</span>
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
                                                Payment details are handled through Stripe’s secure payment flow.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AddMoney;