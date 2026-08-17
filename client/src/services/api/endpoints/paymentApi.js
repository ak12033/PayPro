import api from '../index';

export const paymentApi = {
    createOrder: ({ amount }) => api.post('/payments/create-order', { amount }),

    verify: (razorpayResponse) => api.post('/payments/verify', razorpayResponse),

    getHistory: () => api.get('/payments/history'),
};

export default paymentApi;
