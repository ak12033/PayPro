import express from 'express';
import 'dotenv/config';
import cors from 'cors';
import userRoutes from './routes/userRoutes.js';
import connectDB from './config/db.js';
import authRouter from './routes/authRoutes.js';
import paymentRouter from './routes/paymentRoutes.js';
import transactionRouter from './routes/transactionRoutes.js';

const app = express();

// Connect to DB
await connectDB();

// Middlewares
app.use(cors());
app.use(express.json());

// API Routes
app.get("/", (req, res) => res.send("💾 Server is up and running!"));

app.use('/api/auth', authRouter);
app.use('/api/users', userRoutes);
app.use('/api/transactions', transactionRouter);
app.use('/api/payments', paymentRouter);

// Server Listen
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
