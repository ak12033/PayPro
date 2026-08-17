#!/usr/bin/env node
/**
 * Wallet reconciliation CLI.
 *
 *   node scripts/reconcile.js                  # full read-only report
 *   node scripts/reconcile.js --user <id>      # one account
 *   node scripts/reconcile.js --json           # machine-readable output
 *   node scripts/reconcile.js --repair <id>    # correct one drifted account
 *
 * Intended to be run on a schedule (nightly) with the output shipped to your
 * alerting system: a non-zero exit code means the ledger and the balances
 * disagree and someone needs to look.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { runReconciliation, repairAccountBalance } from '../services/reconciliationService.js';

const args = process.argv.slice(2);
const flag = (name) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? null : (args[i + 1] ?? true);
};

const asJson = args.includes('--json');

const inr = (n) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

const main = async () => {
    await connectDB();

    const repairId = flag('repair');
    if (repairId && repairId !== true) {
        const result = await repairAccountBalance(repairId);
        console.log(JSON.stringify(result, null, 2));
        return result.repaired ? 0 : 0;
    }

    const userId = flag('user');
    const report = await runReconciliation(userId && userId !== true ? { userId } : {});

    if (asJson) {
        console.log(JSON.stringify(report, null, 2));
        return report.healthy ? 0 : 1;
    }

    const { summary } = report;

    console.log('\n═══ PayPro wallet reconciliation ═══');
    console.log(`Generated : ${report.generatedAt}`);
    console.log(`Duration  : ${report.durationMs}ms`);
    console.log(`Status    : ${report.healthy ? '✅ CLEAN' : '❌ DISCREPANCIES FOUND'}\n`);

    console.log(`Drifted accounts               : ${summary.driftedAccounts}`);
    console.log(`Net drift                      : ${inr(summary.netDrift)}`);
    console.log(`Orphaned transfer legs         : ${summary.orphanedTransferLegs}`);
    console.log(`Captured payments w/o credit   : ${summary.capturedPaymentsMissingCredit}`);
    console.log(`Credits w/o captured payment   : ${summary.creditsWithoutCapturedPayment}`);

    if (report.balanceDrift.length) {
        console.log('\n── Accounts whose balance disagrees with their ledger ──');
        for (const row of report.balanceDrift.slice(0, 25)) {
            const sign = row.drift > 0 ? '+' : '';
            console.log(
                `  ${String(row._id)}  ${row.email ?? '(no email)'}\n` +
                `      stored ${inr(row.accountBalance)}  |  ledger ${inr(row.expectedBalance)}  |  drift ${sign}${inr(row.drift)}  (${row.entryCount} entries)`
            );
        }
        console.log('\n  A positive drift means the stored balance is HIGHER than the ledger justifies');
        console.log('  (money that was never backed by a transaction).');
        console.log('  Repair one with:  node scripts/reconcile.js --repair <userId>');
    }

    if (report.orphanedLegs.length) {
        console.log('\n── Transfers missing a leg ──');
        for (const leg of report.orphanedLegs.slice(0, 15)) {
            console.log(`  group ${leg._id}: ${leg.legs} leg(s), types=${leg.types.join('/')}, amounts=${leg.amounts.join('/')}`);
        }
    }

    if (report.payments.missingCredits.length) {
        console.log('\n── Captured payments with no wallet credit (user paid, wallet not credited) ──');
        for (const p of report.payments.missingCredits.slice(0, 15)) {
            console.log(`  order ${p.orderId}  user ${p.userId}  ${inr(p.amount)}  ${p.createdAt.toISOString()}`);
        }
    }

    if (report.payments.unbackedCredits.length) {
        console.log('\n── Wallet credits with no captured payment behind them ──');
        for (const t of report.payments.unbackedCredits.slice(0, 15)) {
            console.log(`  ref ${t.paymentRef}  user ${t.userId}  ${inr(t.amount)}  ${t.createdAt.toISOString()}`);
        }
    }

    console.log('');
    return report.healthy ? 0 : 1;
};

main()
    .then(async (code) => {
        await mongoose.disconnect();
        process.exit(code);
    })
    .catch(async (err) => {
        console.error('Reconciliation failed:', err);
        await mongoose.disconnect().catch(() => {});
        process.exit(2);
    });
