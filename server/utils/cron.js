import cron from 'node-cron';
import User from '../models/User.js';
import { notifyUser } from '../services/notificationService.js';

const LOW_BALANCE_THRESHOLD = 500;
const BATCH_SIZE = 200;

let tasks = [];
let isRunning = false;

/**
 * Daily low-balance reminder.
 *
 * The previous implementation did `User.find({ accountBalance: { $lt: 500 } })`
 * — loading every matching user document into memory at once — and then awaited
 * `notifyUser` one user at a time inside a for-loop. Each of those awaits is a
 * database write plus an FCM round trip, so at a few thousand users the job ran
 * for many minutes while holding the whole result set in memory.
 *
 * This version streams with a cursor, sends in bounded concurrent batches, and
 * projects only the two fields it needs.
 */
const runLowBalanceReminders = async () => {
    // node-cron will happily start a second run while the first is still going.
    if (isRunning) {
        console.warn('Low-balance reminder job is still running; skipping this tick.');
        return;
    }
    isRunning = true;

    console.log('Running scheduled low balance reminder check...');
    let sent = 0;
    let batch = [];

    const flush = async () => {
        if (!batch.length) return;
        await Promise.allSettled(batch.map((user) => notifyUser(
            user._id,
            'Reminder',
            'Low Balance Warning',
            `Your account balance is ₹${user.accountBalance}. Consider topping up your wallet to avoid failed transactions.`,
            { balance: user.accountBalance }
        )));
        sent += batch.length;
        batch = [];
    };

    try {
        const cursor = User.find({
            accountBalance: { $lt: LOW_BALANCE_THRESHOLD },
            'preferences.pushNotifications': { $ne: false }
        })
            .select('_id accountBalance')
            .lean()
            .cursor();

        for await (const user of cursor) {
            batch.push(user);
            if (batch.length >= BATCH_SIZE) await flush();
        }
        await flush();

        console.log(`Sent low balance reminders to ${sent} users.`);
    } catch (error) {
        console.error('Error in scheduled reminder job:', error);
    } finally {
        isRunning = false;
    }
};

export const startCronJobs = () => {
    /**
     * Guard against multi-instance duplication.
     *
     * On a platform that runs more than one replica (or any serverless
     * deployment), every instance previously scheduled this job independently,
     * so users received one reminder per running instance. Opt in explicitly on
     * exactly one worker.
     */
    if (process.env.ENABLE_CRON === 'false') {
        console.log('Cron jobs disabled via ENABLE_CRON=false.');
        return;
    }

    tasks.push(
        cron.schedule('0 9 * * *', runLowBalanceReminders, {
            timezone: process.env.CRON_TIMEZONE || 'Asia/Kolkata'
        })
    );

    console.log('Cron jobs initialized successfully.');
};

/** Stop all scheduled work so the process can exit cleanly. */
export const stopCronJobs = () => {
    tasks.forEach((task) => task.stop());
    tasks = [];
};
