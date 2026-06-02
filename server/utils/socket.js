import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import config from '../config/env.js';

let io = null;

export const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: config.CORS_ORIGIN || 'http://localhost:5173',
            credentials: true
        }
    });

    // Socket.IO authentication middleware
    io.use((socket, next) => {
        let token = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
        
        if (!token) {
            return next(new Error('Authentication error: Token missing'));
        }

        // Support both "Bearer <token>" and raw token
        if (token.startsWith('Bearer ')) {
            token = token.slice(7).trim();
        }

        try {
            const decoded = jwt.verify(token, config.JWT_SECRET);
            socket.user = decoded; // Attaches { id: userId, email: userEmail }
            next();
        } catch (err) {
            console.error('Socket authentication failed:', err.message);
            return next(new Error('Authentication error: Invalid or expired token'));
        }
    });

    io.on('connection', (socket) => {
        const userId = socket.user.id;
        const userRoom = `user:${userId}`;
        socket.join(userRoom);
        
        console.log(`🔌 Client connected: User ${userId} joined room ${userRoom}`);

        socket.on('disconnect', () => {
            console.log(`🔌 Client disconnected: User ${userId}`);
        });
    });

    return io;
};

export const getIO = () => {
    if (!io) {
        throw new Error('Socket.IO is not initialized yet.');
    }
    return io;
};

/**
 * Emit an event to all sockets in a specific user's private room
 * @param {string} userId - The user ID to target
 * @param {string} eventName - Name of the Socket.IO event
 * @param {object} payload - The message payload
 */
export const emitToUser = (userId, eventName, payload) => {
    try {
        const ioInstance = getIO();
        const roomName = `user:${userId}`;
        ioInstance.to(roomName).emit(eventName, payload);
    } catch (err) {
        console.error(`Error emitting event ${eventName} to user ${userId}:`, err.message);
    }
};

export default {
    initSocket,
    getIO,
    emitToUser
};
