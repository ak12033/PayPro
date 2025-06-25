import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import { isValidEmail } from '../utils/validEmail.js';

export const getAllUsers = async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.status(200).json({ users });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

export const getAccountBalance = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        res.status(200).json({ balance: user.accountBalance });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

export const getUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });

        res.status(200).json(user);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

export const updateUserProfile = async (req, res) => {
    try {
        const { firstName, lastName, email, password } = req.body;
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Validate email format if provided
        if (email && !isValidEmail(email)) {
            return res.status(400).json({ message: 'Invalid email format' });
        }

        // Check for duplicate email if changed
        if (email && email !== user.email) {
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                return res.status(409).json({ message: 'Email already in use' });
            }
            user.email = email;
        }

        // Update other fields
        if (firstName) user.firstName = firstName;
        if (lastName) user.lastName = lastName;

        if (password) {
            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(password, salt);
        }

        await user.save();

        res.json({
            message: 'Profile updated successfully',
            user: {
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                accountBalance: user.accountBalance,
                lastLoginLocation: user.lastLoginLocation,
            },
        });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ message: 'Failed to update profile' });
    }
};