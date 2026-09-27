#!/usr/bin/env node
/**
 * Integer-paise backfill CLI (plan.md §7.4, step 2 of 3) — plus the one-time
 * lifecycle backfill for pre-Phase-1 rows that aggregations could not see
 * (see TX_NEEDS_LIFECYCLE in services/minorBackfillService.js).
 *
 *   node scripts/backfillMinor.js                   # dry run: count what would change
 *   node scripts/backfillMinor.js --apply           # write amountMinor / balanceMinor
 *   node scripts/backfillMinor.js --verify          # read-only go/no-go for step 3
 *   node scripts/backfillMinor.js --apply --batch 500
 *   node scripts/backfillMinor.js --verify --json
 *
 * Dry run is the default, mirroring scripts/reconcile.js's read-only default:
 * a migration script that writes when run with no arguments is one typo away
 * from an unreviewed production change. Safe to re-run — see
 * services/minorBackfillService.js for why it is idempotent and why it cannot
 * race a concurrent transfer.
 *
 * Exit codes: 0 clean / applied, 1 verification found mismatches, 2 crashed.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { backfillMinorColumns, verifyMinorColumns } from '../services/minorBackfillService.js';
import { runReconciliation } from '../services/reconciliationService.js';
import { audit } from '../services/auditService.js';
import { AUDIT } from '../models/AuditLog.js';

const args = process.argv.slice(2);
const has = (name) => args.includes(`--${name}`);
const flag = (name) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? null : args[i + 1];
};

const asJson = has('json');
const out = (value) => console.log(asJson ? JSON.stringify(value, null, 2) : value);

const main = async () => {
    await connectDB();

    if (has('verify')) {
        const report = await verifyMinorColumns();
        if (asJson) {
            out(report);
        } else {
            console.log('\n═══ PayPro integer-paise verification ═══');
            console.log(`Status                          : ${report.healthy ? '✅ CLEAN — step 3 may proceed' : '❌ NOT READY'}`);
            console.log(`Transactions missing lifecycle  : ${report.summary.transactionsMissingLifecycle}`);
            console.log(`Transactions missing/mismatched : ${report.summary.transactionsMissingOrMismatched}`);
            console.log(`Users missing/mismatched        : ${report.summary.usersMissingOrMismatched}`);
            console.log(`Accounts with minor-ledger drift: ${report.summary.accountsWithMinorLedgerDrift}`);
            for (const row of report.ledgerDrift.slice(0, 15)) {
                console.log(`  ${row._id}  ${row.email ?? ''}  stored ${row.balanceMinor}p  ledger ${row.expectedMinor}p  drift ${row.driftMinor}p`);
            }
            if (!report.healthy) {
                console.log('\n  Run with --apply to backfill, then --verify again. Drift that survives a');
                console.log('  backfill is a real ledger discrepancy: check `npm run reconcile` first.\n');
            }
        }
        return report.healthy ? 0 : 1;
    }

    const apply = has('apply');
    const batchSize = Number(flag('batch')) || 1000;

    /**
     * No "refuse if the rupee ledger drifts" pre-check, although it was the
     * first instinct: on a database with pre-Phase-1 rows the rupee
     * reconciliation *itself* is wrong until the lifecycle backfill below runs
     * (it cannot see rows with no stored `status`), so such a check would
     * refuse the very run that fixes it. Copying a drifted balance into
     * `balanceMinor` preserves exactly the balance the account already had
     * under the rupee column, and `--verify` reports that drift in integers
     * afterwards, which is where it belongs. (Since plan.md §7.4 step 3,
     * `balanceMinor` is what the balance guard reads, so this copy is what
     * un-refuses payments for an account that predates Phase 2.)
     */

    const result = await backfillMinorColumns({
        dryRun: !apply,
        batchSize,
        onProgress: asJson ? undefined : ({ collection, updated, pending }) =>
            process.stdout.write(`\r  ${collection}: ${updated}/${pending}`),
    });

    if (apply) {
        // Awaited, unlike a request-path audit: the process exits right after,
        // and a fire-and-forget write would be cut off mid-flight.
        await audit(AUDIT.ADMIN_MINOR_BACKFILL, {
            metadata: { transactions: result.transactions, users: result.users, batchSize },
        });
    }

    if (asJson) {
        out(result);
    } else {
        console.log(`\n\n${apply ? 'Applied' : 'Dry run (nothing written — pass --apply)'}`);
        console.log(`Lifecycle   : ${result.lifecycle.pending} pending, ${result.lifecycle.updated} updated  (status/settlement on pre-Phase-1 rows)`);
        console.log(`Transactions: ${result.transactions.pending} pending, ${result.transactions.updated} updated  (amountMinor)`);
        console.log(`Users       : ${result.users.pending} pending, ${result.users.updated} updated  (balanceMinor)`);
    }

    if (apply) {
        // The rupee reconciliation is only trustworthy *after* the lifecycle
        // backfill, so this is the first moment its answer means something.
        const { summary, healthy } = await runReconciliation();
        if (!asJson) {
            console.log(`\nRupee reconciliation: ${healthy ? 'clean' : `${summary.driftedAccounts} drifted account(s) — see npm run reconcile`}`);
            console.log('Next: node scripts/backfillMinor.js --verify\n');
        }
    }
    return 0;
};

main()
    .then(async (code) => {
        await mongoose.disconnect();
        process.exit(code);
    })
    .catch(async (err) => {
        console.error('Backfill failed:', err);
        await mongoose.disconnect().catch(() => {});
        process.exit(2);
    });
