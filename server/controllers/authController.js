import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Otp from '../models/Otp.js';
import Session from '../models/Session.js';
import crypto from 'crypto';
import sendOtp from '../utils/sendOtp.js';
import { isValidEmail } from '../utils/validEmail.js';
import { createSession, generateTokens, REFRESH_COOKIE_OPTIONS } from '../utils/token.js';
import { notifyUser } from '../services/notificationService.js';
import { emitToUser } from '../utils/socket.js';

export const register = async (req, res) => {
    try {
        const { firstName, lastName, email, password } = req.body;

        if (!isValidEmail(email)) {
            return res.status(400).json({ message: 'Invalid email format' });
        }

        if (!password || password.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters long' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ message: 'User already exists' });

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await User.create({
            firstName,
            lastName,
            email,
            password: hashedPassword,
            lastLoginLocation: req.currentLocation,
        });

        const accessToken = await createSession(user, req, res);

        const { password: _removed, ...userWithoutPassword } = user.toObject();

        res.status(201).json({ message: 'Registration successful', accessToken, user: userWithoutPassword });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

export const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user) return res.status(400).json({ message: 'Invalid credentials' });
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

        const currentLoc = req.currentLocation;
        const lastLoc = user.lastLoginLocation;

        const isNewLocation = !user.lastLoginLocation || 
                              user.lastLoginLocation.city !== currentLoc.city;

        // Trigger 2FA if explicitly enabled in preferences or if new location
        if (user.preferences?.twoFactorAuth || isNewLocation) {
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            const otpHash = await bcrypt.hash(otp, 10);

            await Otp.create({
                email: user.email,
                otpHash,
                expiry: Date.now() + 10 * 60 * 1000,
            });

            await sendOtp(user.email, otp);
            
            // Trigger Security Notification only if it's a new location
            if (isNewLocation) {
                await notifyUser(
                    user._id,
                    'Security',
                    'Unrecognized Login Attempt',
                    `We detected a login from a new location (${currentLoc.city || 'Unknown'}). An OTP was sent to your email.`,
                    { city: currentLoc.city, ip: currentLoc.ip }
                );
            }
            return res.status(403).json({
                message: isNewLocation 
                    ? `Login attempt from a new connection. OTP sent to ${user.email}`
                    : `2FA Enabled. OTP sent to ${user.email}`,
                require2FA: true,
                email: user.email,
            });
        }

        const accessToken = await createSession(user, req, res);

        user.lastLoginLocation = currentLoc;
        await user.save();

        res.status(200).json({ message: 'Login successful', accessToken });
    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ message: err.message });
    }
};

export const refresh = async (req, res) => {
    try {
        const { refreshToken } = req.cookies;
        if (!refreshToken) return res.status(401).json({ message: 'No refresh token provided' });

        const hashedToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
        const session = await Session.findOne({ refreshTokenHash: hashedToken });

        if (!session) {
            res.clearCookie('refreshToken', REFRESH_COOKIE_OPTIONS);
            return res.status(401).json({ message: 'Invalid refresh token' });
        }

        if (!session.isValid || session.expiresAt < new Date()) {
            await Session.deleteMany({ familyId: session.familyId }); 
            emitToUser(session.userId.toString(), 'session_compromised', {
                reason: 'Session revoked due to token validation failure.',
                familyId: session.familyId
            });
            res.clearCookie('refreshToken', REFRESH_COOKIE_OPTIONS);
            return res.status(401).json({ message: 'Session expired or compromised' });
        }

        // Rotate token
        session.isValid = false;
        await session.save();

        const user = await User.findById(session.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const { accessToken, plainRefreshToken, hashedRefreshToken: newHash } = generateTokens(user);

        await Session.create({
            userId: user._id,
            refreshTokenHash: newHash,
            familyId: session.familyId,
            deviceInfo: session.deviceInfo,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });
        console.log(accessToken);
        
        res.cookie('refreshToken', plainRefreshToken, REFRESH_COOKIE_OPTIONS);
        res.status(200).json({ accessToken });
    } catch (err) {
        console.error('Refresh Error:', err);
        res.status(500).json({ message: 'Failed to refresh token' });
    }
};

export const logout = async (req, res) => {
    try {
        const { refreshToken } = req.cookies;
        if (refreshToken) {
            const hashedToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
            await Session.findOneAndUpdate({ refreshTokenHash: hashedToken }, { isValid: false });
        }
        res.clearCookie('refreshToken', REFRESH_COOKIE_OPTIONS);
        res.status(200).json({ message: 'Logged out successfully' });
    } catch (err) {
        console.error('Logout Error:', err);
        res.status(500).json({ message: 'Failed to logout' });
    }
};
