import Razorpay from 'razorpay';
import crypto from 'crypto';
import config from '../config/env.js';

export const razorpayInstance = new Razorpay({
    key_id: config.RAZORPAY_KEY_ID,
    key_secret: config.RAZORPAY_KEY_SECRET,
});

export const verifyRazorpaySignature = (orderId, paymentId, signature) => {
    const generatedSignature = crypto
        .createHmac('sha256', config.RAZORPAY_KEY_SECRET)
        .update(orderId + '|' + paymentId)
        .digest('hex');
    return generatedSignature === signature;
};

export const verifyWebhookSignature = (body, signature, secret) => {
    const generatedSignature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(body))
        .digest('hex');
    return generatedSignature === signature;
};
