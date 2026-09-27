import mongoose from 'mongoose';
import { MONGO_URI, MONGO_DB } from '../stack/ports.js';

/**
 * Direct database access for what no endpoint offers: funding a balance,
 * granting a role, drifting an account for reconciliation, and asserting on
 * what the API wrote. Raw collections, not the server's models, so the tests
 * observe stored documents exactly as the API left them.
 */
let connection;

export const db = async () => {
    if (!connection) {
        connection = await mongoose.createConnection(MONGO_URI, { dbName: MONGO_DB }).asPromise();
    }
    return connection;
};

export const collection = async (name) => (await db()).collection(name);

export const closeDb = async () => {
    await connection?.close();
    connection = undefined;
};

export const oid = (id) => new mongoose.Types.ObjectId(String(id));

export const findUser = async (email) => (await collection('users')).findOne({ email });

export const updateUser = async (email, set) => (await collection('users')).updateOne({ email }, { $set: set });
