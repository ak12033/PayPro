import express from 'express';
import 'dotenv/config';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import http from 'http';
import userRoutes from './routes/userRoutes.js';
import connectDB from './config/db.js';
import config from './config/env.js';
import authRouter from './routes/authRoutes.js';
import paymentRouter from './routes/paymentRoutes.js';
import transactionRouter from './routes/transactionRoutes.js';
import notificationRouter from './routes/notificationRoutes.js';
import aiRouter from './routes/aiRoutes.js';
import morgan from "morgan";
import { startCronJobs } from './utils/cron.js';
import { initSocket } from './utils/socket.js';

const app = express();

// Connect to DB
await connectDB();

// Middlewares
app.use(cors({
    origin: config.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

// API Routes
app.get("/", (req, res) => res.send("💾 Server is up and running!"));

app.use('/api/auth', authRouter);
app.use('/api/users', userRoutes);
app.use('/api/transactions', transactionRouter);
app.use('/api/payments', paymentRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/ai', aiRouter);

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
initSocket(server);

// Server Listen
const PORT = config.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    startCronJobs();
});

