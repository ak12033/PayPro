import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import config from '../config/env.js';

let io = null;

/**
 * Socket.IO runs its own CORS check, entirely separate from the Express one.
 *
 * It used to be handed the raw `CORS_ORIGIN` string while server.js split the
 * same variable on commas. With more than one allowed origin configured — the
 * normal case once there is a preview deployment alongside production — the
 * REST API accepted the browser and the websocket handshake rejected it,
 * because `"https://a.com,https://b.com"` never equals any single Origin
 * header. The result was an app that loaded and worked but was silently not
 * live, which is indistinguishable from a broken realtime implementation.
 */
const parseOrigins = () =>
    (config.CORS_ORIGIN || 'http://localhost:5173')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

export const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: parseOrigins(),
            credentials: true
        },
        /**
         * Replay events a client missed while briefly disconnected.
         *
         * A phone switching from wifi to mobile data, or a laptop waking from
         * sleep, drops the socket for a few seconds. Without recovery the
         * client reconnects into a fresh session and any `wallet_update` sent
         * during the gap is gone for good — the balance on screen stays wrong
         * until something refetches it.
         *
         * `skipMiddlewares: false` keeps the JWT check running on the recovered
         * connection, so a recovery cannot outlive the token that authorised it.
         */
        connectionStateRecovery: {
            maxDisconnectionDuration: 2 * 60 * 1000,
            skipMiddlewares: false
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
