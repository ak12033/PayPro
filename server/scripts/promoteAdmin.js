#!/usr/bin/env node
/**
 * One-time bootstrap: grant the first admin.
 *
 *   node scripts/promoteAdmin.js <email>
 *
 * There is no API route for granting the *first* admin, on purpose —
 * `PATCH /api/admin/users/:id/role` requires an existing admin to call it, so
 * the very first one can only come from someone with direct database access.
 * Every admin after that is created through the API, which audit-logs the
 * change with an actor; this script does not, because there is no acting
 * admin yet to attribute it to.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';

const email = process.argv[2];

const main = async () => {
    if (!email) {
        console.error('Usage: node scripts/promoteAdmin.js <email>');
        return 1;
    }

    await connectDB();

    const user = await User.findOneAndUpdate(
        { email: email.toLowerCase().trim() },
        { $set: { role: 'admin' } },
        { new: true }
    ).select('email role');

    if (!user) {
        console.error(`No user found with email ${email}`);
        return 1;
    }

    console.log(`${user.email} is now role=${user.role}`);
    return 0;
};

main()
    .then(async (code) => {
        await mongoose.disconnect();
        process.exit(code);
    })
    .catch(async (err) => {
        console.error('promoteAdmin failed:', err);
        await mongoose.disconnect().catch(() => {});
        process.exit(2);
    });
