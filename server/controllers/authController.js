import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Otp from '../models/Otp.js';
import sendOtp from '../utils/sendOtp.js';

export const register = async (req, res) => {
    try {
        const { firstName, lastName, email, password } = req.body;

        // Email format validation
        if (!isValidEmail(email)) {
            return res.status(400).json({ message: 'Invalid email format' });
        }

        // Password strength check
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

        const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, {
            expiresIn: '2d',
        });

        // Omit password before sending back user
        const { password: _removed, ...userWithoutPassword } = user.toObject();

        res.status(201).json({ message: 'Registration successful', token, user: userWithoutPassword });
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

        // If first login or different city/IP
        if (!lastLoc || lastLoc.city !== currentLoc.city || lastLoc.ip !== currentLoc.ip) {
            // console.log(`⚠️ New login location for ${email}`);
            // console.log('Previous:', lastLoc);
            // console.log('Current:', currentLoc);

            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            const otpHash = await bcrypt.hash(otp, 10);

            await Otp.create({
                email: user.email,
                otpHash,
                expiry: Date.now() + 10 * 60 * 1000,
            });

            await sendOtp(user.email, otp);
            return res.status(403).json({
                message: `Login attempt from a new connection. OTP sent to ${user.email}`,
                require2FA: true,
                email: user.email,
            });
        }
        // Same location — proceed with login
        const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, {
            expiresIn: '2d',
        });

        // Update last login location
        user.lastLoginLocation = currentLoc;
        await user.save();

        res.status(200).json({ message: 'Login successful', token });
    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ message: err.message });
    }
};
