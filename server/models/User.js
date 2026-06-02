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
    fcmTokens: { type: [String], default: [] },
    preferences: {
        twoFactorAuth: { type: Boolean, default: false },
        transaction2FA: { type: Boolean, default: true },
        emailAlerts: { type: Boolean, default: true },
        pushNotifications: { type: Boolean, default: true }
    }
});

export default mongoose.model('User', userSchema);
