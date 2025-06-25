import React, { useState } from 'react';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import api from '../../api/api';
import toast from 'react-hot-toast';
import { ImSpinner2 } from 'react-icons/im';
import { useAuth } from '../../context/AuthContext';

const CheckoutForm = ({ amount }) => {
    const stripe = useStripe();
    const elements = useElements();
    const { token, fetchDashboardData } = useAuth();
    const [processing, setProcessing] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!stripe || !elements) return;

        try {
            setProcessing(true);

            const { data } = await api.post(
                '/payments/create-payment-intent',
                { amount },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            const result = await stripe.confirmCardPayment(data.clientSecret, {
                payment_method: {
                    card: elements.getElement(CardElement),
                },
            });

            if (result.error) {
                toast.error(result.error.message);
            } else if (result.paymentIntent.status === 'succeeded') {
                await api.post(
                    '/payments/credit-balance',
                    { amount },
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                toast.success('Payment successful! 🎉 Balance updated.');
                fetchDashboardData(); // 🔥 Refresh global dashboard state after payment
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Payment failed.');
        } finally {
            setProcessing(false);
        }
    };

    return (
        <form
            onSubmit={handleSubmit}
            className="p-8 bg-gradient-to-br from-white/5 to-white/10 backdrop-blur-md rounded-2xl shadow-xl space-y-6 border border-white/20"
        >
            <h2 className="text-2xl font-semibold text-white">💳 Complete Payment</h2>

            <div className="border border-white/20 rounded-lg p-4 shadow-sm bg-white/5">
                <CardElement
                    className="p-2 text-white"
                    options={{
                        style: {
                            base: {
                                fontSize: '16px',
                                color: '#f1f5f9',
                                '::placeholder': {
                                    color: '#94a3b8',
                                },
                            },
                        },
                    }}
                />
            </div>

            <button
                type="submit"
                disabled={!stripe || processing}
                className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-cyan-400 to-blue-500 text-gray-900 font-semibold py-3 rounded-lg shadow hover:from-cyan-500 hover:to-blue-600 transition-all duration-300 disabled:opacity-60"
            >
                {processing ? (
                    <>
                        <ImSpinner2 className="animate-spin" size={20} />
                        Processing Payment...
                    </>
                ) : (
                    `Pay ₹${amount}`
                )}
            </button>
        </form>
    );
};

export default CheckoutForm;
