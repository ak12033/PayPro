import jwt from 'jsonwebtoken';
import config from '../config/env.js';

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];

    jwt.verify(token, config.JWT_SECRET, (err, user) => {
        if (err) return res.status(401).json({ message: 'Token expired or invalid', code: 'TOKEN_EXPIRED' });
        req.user = user;
        next();
    });
};

export default authMiddleware;