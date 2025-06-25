import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    firstName: String,
    lastName: String,
    email: { type: String, unique: true },
    password: String,
    lastLoginLocation: {
        city: String,
        ip: String,
        isp: String,
    },
    accountBalance: { type: Number, default: 0 },
});

export default mongoose.model('User', userSchema);
