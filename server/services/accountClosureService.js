import User from '../models/User.js';
import Session from '../models/Session.js';
import Transaction from '../models/Transaction.js';
import Budget from '../models/Budget.js';
import Goal from '../models/Goal.js';
import GoalContribution from '../models/GoalContribution.js';
import Notification from '../models/Notification.js';
import LoginHistory from '../models/LoginHistory.js';
import BankAccount from '../models/BankAccount.js';
import WithdrawalRequest, { OPEN_WITHDRAWAL_STATUSES } from '../models/WithdrawalRequest.js';
import Holding from '../models/Holding.js';
import Liability from '../models/Liability.js';
import { getMine as getKycForHolder } from './kycService.js';
import { listMyWithdrawals } from './withdrawalService.js';
import { DomainError } from '../utils/domainError.js';
import { audit } from './auditService.js';
import { AUDIT } from '../models/AuditLog.js';

/**
 * Close an account (plan.md §40.2).
 *
 * Financial records are retained, untouched — Transactions, Budgets, Goals
 * and GoalContributions all keep pointing at this `userId` after closure,
 * because deleting them is usually not permitted for a money product and the
 * exact retention boundary is a legal determination the plan explicitly
 * defers (§41). Everything *identifying* is scrubbed: sessions revoked, push
 * tokens dropped, name replaced, email pseudonymised behind a prefix that
 * preserves the schema's `unique` constraint without inventing a collision.
 */
export const closeAccount = async (userId, { reason = 'User requested closure' } = {}) => {
    const user = await User.findById(userId);
    if (!user) return null;

    // Money held for a withdrawal belongs to this holder until it is paid or
    // returned; closing underneath it would leave a hold nobody can see.
    if (await WithdrawalRequest.exists({ userId, status: { $in: OPEN_WITHDRAWAL_STATUSES } })) {
        throw new DomainError('WITHDRAWAL_OPEN', 'A withdrawal is still in progress. Wait for it to finish, or cancel it, before closing your account.', 409);
    }

    const pseudonymisedEmail = `closed+${user._id}@deleted.local`;

    await Promise.all([
        Session.deleteMany({ userId }),
        BankAccount.updateMany({ userId, status: { $ne: 'removed' } }, { $set: { status: 'removed', removedAt: new Date() } }),
        User.updateOne(
            { _id: userId },
            {
                $set: {
                    status: 'closed',
                    firstName: 'Deleted',
                    lastName: 'User',
                    email: pseudonymisedEmail,
                    fcmTokens: [],
                    // Identity is retained (KycSubmission/KycDecision are
                    // financial-compliance records, §40.2) but no longer vouches
                    // for anything.
                    kycTier: 'unverified',
                    // Bump tokenVersion so any access token minted before closure
                    // is rejected on its very next use, not just at expiry.
                    tokenVersion: (user.tokenVersion || 0) + 1,
                },
            }
        ),
    ]);

    await audit(AUDIT.ACCOUNT_CLOSED, { userId, metadata: { reason } });

    return { closed: true };
};

/**
 * A JSON export of everything this user's own account can see (plan.md
 * §40.2). Streamed to the caller, never written to disk — this bundle
 * contains full transaction history and must not create a second, unmanaged
 * copy of it at rest.
 */
export const exportUserData = async (userId) => {
    const [profile, transactions, budgets, goals, notifications, loginHistory] = await Promise.all([
        User.findById(userId).select('-password -fcmTokens -failedLoginAttempts -lockUntil -tokenVersion').lean(),
        Transaction.find({ userId }).sort({ createdAt: -1 }).lean(),
        Budget.find({ userId }).lean(),
        Goal.find({ userId }).lean(),
        Notification.find({ userId }).sort({ createdAt: -1 }).limit(200).lean(),
        LoginHistory.find({ userId }).sort({ createdAt: -1 }).limit(100).lean(),
    ]);

    // Phase 5 records, in the holder's own (masked) view — never the
    // encrypted identifiers, and never staff ids or internal notes.
    const [kyc, bankAccounts, withdrawals, holdings, liabilities] = await Promise.all([
        getKycForHolder(userId),
        BankAccount.find({ userId }).select('holderName accountNumberMasked ifsc bankName status createdAt').lean(),
        listMyWithdrawals(userId),
        Holding.find({ userId }).lean(),
        Liability.find({ userId }).lean(),
    ]);

    const goalContributions = goals.length
        ? await GoalContribution.find({ goalId: { $in: goals.map((g) => g._id) } }).lean()
        : [];

    await audit(AUDIT.DATA_EXPORTED, { userId });

    return {
        exportedAt: new Date().toISOString(),
        profile,
        transactions,
        budgets,
        goals,
        goalContributions,
        notifications,
        loginHistory,
        identityVerification: kyc.submission,
        bankAccounts,
        withdrawals,
        holdings,
        liabilities,
    };
};
