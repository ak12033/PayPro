import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema({
    email: String,
    otpHash: String,
    expiry: Date,
});

export default mongoose.model('Otp', otpSchema);
