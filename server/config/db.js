import mongoose from "mongoose";
import config from "./env.js";
import logger from "../utils/logger.js";

/**
 * Connect to MongoDB.
 *
 * The original swallowed connection errors with a `console.log` and returned
 * normally, so the process went on to bind a port and serve traffic against a
 * database it had never reached — every request then failed with an opaque
 * timeout. A datastore we cannot reach is not a recoverable state at boot.
 */
const connectDB = async () => {
    mongoose.connection.on('connected', () => logger.info('Database connected'));
    mongoose.connection.on('error', (err) => logger.error('MongoDB error', { error: err.message }));
    mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));

    // Reject queries buffered against a down connection rather than hanging for
    // the default 10s and tying up a request slot.
    mongoose.set('bufferCommands', false);
    // Strip filter keys that aren't in the schema.
    mongoose.set('strictQuery', true);
    // Auto-build indexes in dev only; in production a deploy should never block
    // on a foreground index build.
    mongoose.set('autoIndex', config.NODE_ENV !== 'production');

    try {
        // Insert the db name before the query string rather than blindly
        // appending it — the local compose URI carries
        // ?replicaSet=rs0&directConnection=true, and tacking "/PayPro" on
        // after that mangles directConnection into "true/PayPro".
        const [base, query] = config.MONGO_URI.split('?');
        const uri = query
            ? `${base.replace(/\/$/, '')}/PayPro?${query}`
            : `${config.MONGO_URI}/PayPro`;

        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
            maxPoolSize: 20,
            minPoolSize: 2,
            retryWrites: true,
        });
    } catch (error) {
        logger.error('Failed to connect to MongoDB', { error: error.message });
        process.exit(1);
    }
};

export default connectDB;
