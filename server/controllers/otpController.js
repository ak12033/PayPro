import Otp from '../models/Otp.js';
import bcrypt from 'bcryptjs';
import sendOtp from '../utils/sendOtp.js';
import User from '../models/User.js';
import jwt from 'jsonwebtoken';

export const verifyLoginOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) return res.status(400).json({ message: 'Email and OTP are required' });

        const otpRecord = await Otp.findOne({ email });
        if (!otpRecord) return res.status(404).json({ message: 'No OTP found' });

        if (otpRecord.expiry < Date.now()) {
            await Otp.deleteOne({ email });
            return res.status(410).json({ message: 'OTP expired' });
        }

        const isMatch = await bcrypt.compare(otp.toString(), otpRecord.otpHash);
        if (!isMatch) return res.status(401).json({ message: 'Invalid OTP' });

        await Otp.deleteOne({ email });

        const user = await User.findOne({ email });
        const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, {
            expiresIn: '2d',
        });
        user.lastLoginLocation = req.currentLocation;
        await user.save();

        res.status(200).json({ message: 'Login successful', token });
    } catch (error) {
        console.error('Login OTP Verification Error:', error);
        res.status(500).json({ message: 'Failed to verify login OTP' });
    }
};


export const resendLoginOtp = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email is required' });

        await Otp.deleteMany({ email });

        const otp = Math.floor(100000 + Math.random() * 900000);
        const otpHash = await bcrypt.hash(otp.toString(), 10);

        await Otp.create({
            email,
            otpHash,
            expiry: Date.now() + 5 * 60000,
        });

        await sendOtp(email, otp);

        res.status(200).json({ message: 'Login OTP sent successfully' });
    } catch (error) {
        console.error('Send Login OTP Error:', error);
        res.status(500).json({ message: 'Failed to send login OTP' });
    }
};

export const verifyOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ message: 'Email and OTP are required.' });
        }

        const otpRecord = await Otp.findOne({ email });
        if (!otpRecord) {
            return res.status(404).json({ message: 'No OTP found for this email.' });
        }

        if (otpRecord.expiry < Date.now()) {
            await Otp.deleteOne({ email });
            return res.status(410).json({ message: 'OTP expired. Please request a new one.' });
        }

        const isMatch = await bcrypt.compare(otp.toString(), otpRecord.otpHash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid OTP. Please check and try again.' });
        }

        await Otp.deleteOne({ email });

        console.log(`OTP verified for ${email}`);
        return res.status(200).json({ message: 'OTP verified successfully.' });

    } catch (error) {
        console.error('OTP Verification Error:', error);
        res.status(500).json({ message: 'Failed to verify OTP. Please try again.' });
    }
};

export const resendOtp = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email is required' });

        // Delete old OTPs
        await Otp.deleteMany({ email });

        const otp = Math.floor(100000 + Math.random() * 900000);
        const otpHash = await bcrypt.hash(otp.toString(), 10);

        await Otp.create({
            email,
            otpHash,
            expiry: new Date(Date.now() + 5 * 60000),
        });

        await sendOtp(email, otp);

        res.status(200).json({ message: 'OTP resent successfully' });
    } catch (error) {
        console.error('Resend OTP error:', error);
        res.status(500).json({ message: 'Failed to resend OTP' });
    }
};

