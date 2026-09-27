import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import { LedgerError } from './ledgerService.js';
import { startOfDayIST, startOfMonthIST } from '../utils/period.js';
import { SETTLED_STATUSES, HOLD_STATUSES, TX_SOURCE, TX_STATUS } from '../constants/transactionStatus.js';
import { AMOUNT_MINOR_EXPR, toPaise } from '../utils/money.js';

/**
 * Velocity and balance ceilings by KYC tier (plan.md §29.2).
 *
 * The tier is set only by the internal KYC workflow (Phase 5,
 * `kycService`): a reviewer's VERIFIED decision raises it to `basic` or `full`,
 * and any move out of VERIFIED returns it to `unverified` (plan.md §0.20.2).
 * Nothing here needs to know how — it only reads `User.kycTier`.
 *
 * Figures are in *minor units* (paise) per the plan's own numbers, and every
 * comparison below is made in paise against the ledger's integer column
 * (plan.md §7.4 step 3). Callers still pass rupee amounts — that is what
 * `parseAmount` validates — and each is converted once, exactly, on entry.
 * These are explicitly placeholders pending the regulatory determination in
 * plan.md §41 (RBI PPI limits by KYC tier), not a considered business decision.
 */
export const LIMITS = {
    unverified: { perTxnMinor: 1_000_000, dailyMinor: 2_500_000, monthlyMinor: 10_000_000, maxBalanceMinor: 10_000_000 },
    basic: { perTxnMinor: 10_000_000, dailyMinor: 20_000_000, monthlyMinor: 100_000_000, maxBalanceMinor: 20_000_000 },
    full: { perTxnMinor: 100_000_000, dailyMinor: 200_000_000, monthlyMinor: 1_000_000_000, maxBalanceMinor: null },
};

const toRupees = (minor) => (minor === null || minor === undefined ? null : minor / 100);

export const limitsForTier = (tier) => {
    const minor = LIMITS[tier] || LIMITS.unverified;
    return {
        perTxn: toRupees(minor.perTxnMinor),
        daily: toRupees(minor.dailyMinor),
        monthly: toRupees(minor.monthlyMinor),
        maxBalance: toRupees(minor.maxBalanceMinor),
    };
};

const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

/**
 * Outgoing volume for `userId` since `since`, in paise: settled transfers, plus
 * withdrawals (Phase 5) whether paid or still held — held money has already
 * left the wallet, and a ceiling that ignored it could be walked past by
 * queueing withdrawals faster than they are reviewed.
 */
const transferVolumeSince = async (userId, since) => {
    const [row] = await Transaction.aggregate([
        {
            $match: {
                userId: new mongoose.Types.ObjectId(userId),
                type: 'Debit',
                settlement: 'settled',
                createdAt: { $gte: since },
                $or: [
                    { category: 'Transfer', status: { $in: SETTLED_STATUSES } },
                    { source: TX_SOURCE.WITHDRAWAL, status: { $in: [...HOLD_STATUSES, TX_STATUS.SUCCESS] } },
                ],
            },
        },
        { $group: { _id: null, total: { $sum: AMOUNT_MINOR_EXPR } } },
    ]);
    return row?.total ?? 0;
};

/**
 * Throws `LedgerError('LIMIT_EXCEEDED', ...)` when a proposed transfer of
 * `amount` rupees would breach the caller's per-transaction, daily, or
 * monthly ceiling for their KYC tier. Read-only — callers that want the
 * breach to actually block the transfer call this before `transferFunds`,
 * the same way `sendMoney` already checks `sender.accountBalance` up front.
 *
 * Day/month boundaries are IST (utils/period.js), consistent with every
 * other velocity check in this codebase (the pre-existing 2FA threshold in
 * `dailyTransferCount` already made this mistake once with server-local
 * time — see plan.md §4.11).
 */
export const checkTransferLimits = async ({ userId, tier, amount, noun = 'transfer' }) => {
    const limits = limitsForTier(tier);
    const minor = LIMITS[tier] || LIMITS.unverified;
    const amountMinor = toPaise(amount);

    if (amountMinor > minor.perTxnMinor) {
        throw new LedgerError('LIMIT_EXCEEDED', `This ${noun} exceeds your per-transaction limit of ${inr(limits.perTxn)}.`, 400);
    }

    const [dayTotal, monthTotal] = await Promise.all([
        transferVolumeSince(userId, startOfDayIST()),
        transferVolumeSince(userId, startOfMonthIST()),
    ]);

    if (dayTotal + amountMinor > minor.dailyMinor) {
        throw new LedgerError('LIMIT_EXCEEDED', `This ${noun} would exceed your daily limit of ${inr(limits.daily)}.`, 400);
    }
    if (monthTotal + amountMinor > minor.monthlyMinor) {
        throw new LedgerError('LIMIT_EXCEEDED', `This ${noun} would exceed your monthly limit of ${inr(limits.monthly)}.`, 400);
    }
};

/**
 * Throws when crediting `amount` rupees would push the wallet above the
 * tier's balance ceiling. `full` tier has no ceiling (`maxBalance: null`).
 *
 * Pass the wallet as `currentBalanceMinor` (the user's `balanceMinor`).
 * `currentBalance` in rupees is still accepted for older callers.
 */
export const checkBalanceCeiling = ({ tier, currentBalance, currentBalanceMinor, amount }) => {
    const limits = limitsForTier(tier);
    const { maxBalanceMinor } = LIMITS[tier] || LIMITS.unverified;
    if (maxBalanceMinor === null) return;

    const heldMinor = Number.isInteger(currentBalanceMinor) ? currentBalanceMinor : toPaise(currentBalance ?? 0);
    if (heldMinor + toPaise(amount) > maxBalanceMinor) {
        throw new LedgerError('LIMIT_EXCEEDED', `This top-up would exceed your maximum wallet balance of ${inr(limits.maxBalance)} for your account tier.`, 400);
    }
};
