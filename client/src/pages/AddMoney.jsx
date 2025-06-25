import React, { useState } from 'react';
import Sidebar from '../components/Sidebar';
import CheckoutForm from '../components/stripe/CheckoutForm';
import { Elements } from '@stripe/react-stripe-js';
import { stripePromise } from '../stripe/stripe';

const AddMoney = () => {
    const [amount, setAmount] = useState('');

    return (
        <div className="flex min-h-screen bg-gradient-to-br from-sky-950 via-sky-900 to-sky-950 text-white">
            <div className="fixed top-0 left-0 h-screen w-64 bg-sky-900">
                <Sidebar />
            </div>

            <div className="flex-1 p-8 ml-64">
                <h1 className="text-4xl font-bold mb-10 flex items-center gap-3 tracking-tight">
                    💰 Add Money
                </h1>

                <div className="max-w-xl mx-auto bg-white/10 backdrop-blur-lg rounded-3xl shadow-2xl p-10 space-y-8 border border-white/20">
                    <div>
                        <label htmlFor="amount" className="block text-lg font-medium text-gray-200 mb-2">
                            Enter Amount (₹)
                        </label>
                        <input
                            id="amount"
                            type="number"
                            placeholder="E.g. 500"
                            className="w-full border border-white/20 rounded-xl p-4 bg-white/5 text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-400 outline-none transition"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                        />
                    </div>

                    {amount && amount > 0 && (
                        <Elements stripe={stripePromise}>
                            <CheckoutForm amount={amount} />
                        </Elements>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AddMoney;
