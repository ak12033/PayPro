import cron from 'node-cron';
import User from '../models/User.js';
import Budget from '../models/Budget.js';
import ReconciliationReport from '../models/ReconciliationReport.js';
import { notifyUser } from '../services/notificationService.js';
import { rollover as rolloverBudget } from '../services/budgetService.js';
import { generateForUser } from '../services/insightsService.js';
import { runReconciliation } from '../services/reconciliationService.js';
import { detectForUser } from '../services/recurringService.js';
import { seedFromRecurring, sendReminders } from '../services/billService.js';
import { autoReleaseExpired } from '../services/riskCaseService.js';
import { sweepRecentActivity } from '../services/amlService.js';
import logger from './logger.js';
import { APP_TIMEZONE } from './period.js';
import { balanceOf, balanceMinorOf, toPaise } from './money.js';

const LOW_BALANCE_THRESHOLD = 500;
const BATCH_SIZE = 200;

let tasks = [];
let isRunning = false;
let budgetRolloverRunning = false;
let insightsRunning = false;
let reconciliationRunning = false;
let recurringRunning = false;
let billRemindersRunning = false;
let riskReleaseRunning = false;
let amlSweepRunning = false;

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
        logger.warn('Low-balance reminder job is still running; skipping this tick');
        return;
    }
    isRunning = true;

    logger.info('Running scheduled low balance reminder check');
    let sent = 0;
    let batch = [];

    const flush = async () => {
        if (!batch.length) return;
        await Promise.allSettled(batch.map((user) => notifyUser(
            user._id,
            'Reminder',
            'Low Balance Warning',
            `Your account balance is ₹${balanceOf(user)}. Consider topping up your wallet to avoid failed transactions.`,
            { balance: balanceOf(user), balanceMinor: balanceMinorOf(user) }
        )));
        sent += batch.length;
        batch = [];
    };

    try {
        const cursor = User.find({
            balanceMinor: { $lt: toPaise(LOW_BALANCE_THRESHOLD) },
            'preferences.pushNotifications': { $ne: false }
        })
            .select('_id balanceMinor')
            .lean()
            .cursor();

        for await (const user of cursor) {
            batch.push(user);
            if (batch.length >= BATCH_SIZE) await flush();
        }
        await flush();

        logger.info('Sent low balance reminders', { sent });
    } catch (error) {
        logger.error('Scheduled low-balance reminder job failed', { err: error });
    } finally {
        isRunning = false;
    }
};

/**
 * Materialise next month's budget for every `recurring:true` template
 * (plan.md §13.5). Idempotent via `Budget`'s unique `{userId,periodStart}`
 * index — `rolloverBudget` already treats a duplicate-key error as "already
 * rolled over" and returns null rather than throwing.
 */
const runBudgetRollover = async () => {
    if (budgetRolloverRunning) return;
    budgetRolloverRunning = true;

    let rolled = 0;
    try {
        /**
         * `periodEnd <= now` — otherwise every recurring budget a user has
         * ever had (the `recurring` flag is copied forward onto each new
         * period by `rolloverBudget`) would be re-attempted every run. The
         * unique `{userId,periodStart}` index makes that merely wasteful
         * rather than wrong, but this filter is what makes each run only
         * touch the one period that actually just ended.
         */
        const cursor = Budget.find({ recurring: true, archivedAt: null, periodEnd: { $lte: new Date() } })
            .lean().cursor();
        for await (const budget of cursor) {
            try {
                const next = await rolloverBudget(budget.userId, budget._id);
                if (next) rolled += 1;
            } catch (err) {
                logger.error('Budget rollover failed for one budget', { budgetId: String(budget._id), error: err.message });
            }
        }
        logger.info('Budget rollover complete', { rolled });
    } catch (err) {
        logger.error('Budget rollover job failed', { error: err.message });
    } finally {
        budgetRolloverRunning = false;
    }
};

/** Weekly deterministic insights for every active user (plan.md §24.2.3, deterministic half only — see §0 deviations). */
const runWeeklyInsights = async () => {
    if (insightsRunning) return;
    insightsRunning = true;

    let processed = 0;
    try {
        const cursor = User.find({ status: 'active' }).select('_id').lean().cursor();
        for await (const user of cursor) {
            try {
                await generateForUser(user._id);
                processed += 1;
            } catch (err) {
                logger.error('Insight generation failed for one user', { userId: String(user._id), error: err.message });
            }
        }
        logger.info('Weekly insight generation complete', { processed });
    } catch (err) {
        logger.error('Weekly insights job failed', { error: err.message });
    } finally {
        insightsRunning = false;
    }
};

/**
 * Daily reconciliation (plan.md §29.3). `runReconciliation` already exists
 * and is safe to call repeatedly (read-only); this just persists the run and
 * alerts admin/risk users, deduped per calendar day, when it finds drift.
 */
const runScheduledReconciliation = async () => {
    if (reconciliationRunning) return;
    reconciliationRunning = true;

    try {
        const report = await runReconciliation();
        const saved = await ReconciliationReport.create(report);

        if (!report.healthy) {
            const dayKey = new Date().toISOString().slice(0, 10);
            const admins = await User.find({ role: { $in: ['admin', 'risk'] }, status: 'active' })
                .select('_id').lean();

            await Promise.allSettled(admins.map((admin) => notifyUser(
                admin._id,
                'System',
                'Ledger reconciliation found drift',
                `Reconciliation on ${dayKey} found ${report.summary.driftedAccounts} drifted account(s), net drift ₹${report.summary.netDrift}.`,
                { reportId: String(saved._id) },
                { dedupeKey: `reconciliation:${dayKey}` }
            )));

            await ReconciliationReport.updateOne({ _id: saved._id }, { $set: { alertedAt: new Date() } });
            logger.error('Scheduled reconciliation found drift', { summary: report.summary });
        } else {
            logger.info('Scheduled reconciliation clean', { durationMs: report.durationMs });
        }
    } catch (err) {
        logger.error('Scheduled reconciliation job failed', { error: err.message });
    } finally {
        reconciliationRunning = false;
    }
};

/**
 * Nightly recurring-payment detection (plan.md §18.1).
 *
 * Per active user, streamed with a cursor for the same reason the low-balance
 * job is: loading every user document to run a per-user aggregation is the
 * shape of job that works in development and falls over in production.
 * Seeding bills from the results runs in the same pass, so a detection and the
 * reminder it implies never sit a day apart.
 */
const runRecurringDetection = async () => {
    if (recurringRunning) return;
    recurringRunning = true;

    let processed = 0;
    let detected = 0;
    let seeded = 0;
    try {
        const cursor = User.find({ status: 'active' }).select('_id').lean().cursor();
        for await (const user of cursor) {
            try {
                const result = await detectForUser(user._id);
                detected += result.created;
                const seeding = await seedFromRecurring(user._id);
                seeded += seeding.seeded;
                processed += 1;
            } catch (err) {
                logger.error('Recurring detection failed for one user', {
                    userId: String(user._id), error: err.message,
                });
            }
        }
        logger.info('Recurring detection complete', { processed, detected, seeded });
    } catch (err) {
        logger.error('Recurring detection job failed', { error: err.message });
    } finally {
        recurringRunning = false;
    }
};

/** Daily bill reminders (plan.md §19.2). Deduped per bill per day inside the service. */
const runBillReminders = async () => {
    if (billRemindersRunning) return;
    billRemindersRunning = true;

    try {
        const result = await sendReminders();
        logger.info('Bill reminders complete', result);
    } catch (err) {
        logger.error('Bill reminder job failed', { error: err.message });
    } finally {
        billRemindersRunning = false;
    }
};

/**
 * Release held transfers whose review deadline has passed (plan.md §30.2.3).
 *
 * Hourly rather than daily. The deadline is 24 hours; sweeping once a day would
 * mean an average of another 12 hours on top of it, so a user whose money was
 * held could wait a day and a half for a release the policy promised in one.
 */
const runRiskAutoRelease = async () => {
    if (riskReleaseRunning) return;
    riskReleaseRunning = true;

    try {
        const result = await autoReleaseExpired();
        if (result.released > 0) logger.info('Risk auto-release complete', result);
    } catch (err) {
        logger.error('Risk auto-release job failed', { error: err.message });
    } finally {
        riskReleaseRunning = false;
    }
};

/**
 * Nightly AML sweep (plan.md §30.3, shadow mode). The per-movement hook sees
 * each transfer as it settles; this sees the finished day, so a pattern built
 * from movements that each looked fine on their own is still caught.
 */
const runAmlSweep = async () => {
    if (amlSweepRunning) return;
    amlSweepRunning = true;

    try {
        const result = await sweepRecentActivity();
        logger.info('AML sweep complete', result);
    } catch (err) {
        logger.error('AML sweep job failed', { error: err.message });
    } finally {
        amlSweepRunning = false;
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
        logger.info('Cron jobs disabled via ENABLE_CRON=false');
        return;
    }

    const timezone = process.env.CRON_TIMEZONE || APP_TIMEZONE;

    tasks.push(
        cron.schedule('0 9 * * *', runLowBalanceReminders, { timezone }),
        // 00:05 IST on the 1st of the month.
        cron.schedule('5 0 1 * *', runBudgetRollover, { timezone }),
        // Monday 07:00 IST.
        cron.schedule('0 7 * * 1', runWeeklyInsights, { timezone }),
        // Daily 02:00 IST.
        cron.schedule('0 2 * * *', runScheduledReconciliation, { timezone }),
        // Daily 03:00 IST — after reconciliation, so detection reads a ledger
        // whose drift has already been reported rather than racing the report.
        cron.schedule('0 3 * * *', runRecurringDetection, { timezone }),
        // Daily 08:00 IST: early enough to act on a bill due today.
        cron.schedule('0 8 * * *', runBillReminders, { timezone }),
        // Hourly — see runRiskAutoRelease for why not daily.
        cron.schedule('0 * * * *', runRiskAutoRelease, { timezone }),
        // Daily 01:30 IST, after the day it looks at has ended.
        cron.schedule('30 1 * * *', runAmlSweep, { timezone })
    );

    logger.info('Cron jobs initialized', { count: tasks.length, timezone });
};

/** Stop all scheduled work so the process can exit cleanly. */
export const stopCronJobs = () => {
    tasks.forEach((task) => task.stop());
    tasks = [];
};
