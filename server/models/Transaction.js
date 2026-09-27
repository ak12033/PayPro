import mongoose from 'mongoose';
import { TX_STATUSES, TX_STATUS, TX_SOURCES, TX_SETTLEMENTS, TX_SETTLEMENT } from '../constants/transactionStatus.js';

const transactionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    description: { type: String, required: true, trim: true, maxlength: 280 },
    amount: { type: Number, required: true, min: 0 },
    /**
     * The amount in integer paise — what every ledger sum reads since plan.md
     * §7.4 step 3 (via `AMOUNT_MINOR_EXPR` / `amountMinorOf` in
     * utils/money.js, which fall back to `round(amount * 100)` for a row the
     * backfill has not reached). `amount` is still written alongside it for
     * one release as the rollback path.
     */
    amountMinor: { type: Number, min: 0 },
    type: { type: String, enum: ['Credit', 'Debit'], required: true },
    category: { type: String, trim: true, maxlength: 60, default: 'Others' },
    icon: { type: String, default: 'ShoppingBag' },
    invoiceId: { type: String, unique: true, required: true },
    riskScore: { type: Number, default: 0, min: 0, max: 100 },
    riskLevel: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
    riskReason: { type: String, default: '' },
    /**
     * Links the two legs of a P2P transfer so the pair can be reconciled, and
     * ties wallet credits back to the Payment that produced them.
     */
    transferGroupId: { type: String },
    paymentRef: { type: String },
    /**
     * Client-supplied de-duplication key. A double-clicked "Send" button, or an
     * axios retry after a timeout, previously produced two real transfers.
     * The unique index below makes the second attempt fail fast instead.
     *
     * Superseded by `IdempotencyKey`, which claims the key *before* settlement
     * rather than recording it after. This field is kept, still written, so a
     * transaction row remains self-describing and older records stay valid.
     */
    idempotencyKey: { type: String },

    /**
     * Lifecycle. Defaults to SUCCESS/settled so every pre-existing row (and
     * every row a test fixture creates without thinking about status) is
     * correctly treated as "this really happened" — only a write path that
     * explicitly knows a transaction is pending (a top-up order, say) sets
     * anything else. See constants/transactionStatus.js for the transition map.
     */
    status: { type: String, enum: TX_STATUSES, default: TX_STATUS.SUCCESS, index: true },
    statusHistory: [{
        from: String,
        to: String,
        at: { type: Date, default: Date.now },
        reason: String,
        actor: String,
    }],

    /** How this row was produced. */
    source: { type: String, enum: TX_SOURCES },
    /**
     * Whether this row participates in the balance invariant. 'none' means the
     * row is a record only — a manual note the user typed in — and must never
     * be summed into `accountBalance`. Defaults to 'settled' for the same
     * reason `status` defaults to SUCCESS: every real money movement in this
     * codebase always was settled the moment it was written.
     */
    settlement: { type: String, enum: TX_SETTLEMENTS, default: TX_SETTLEMENT.SETTLED, index: true },

    counterparty: {
        kind: { type: String, enum: ['user', 'merchant', 'external', 'self'] },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        name: String,
    },

    categorySource: { type: String, enum: ['ai', 'user', 'rule', 'system'], default: 'ai' },
    categoryConfidence: { type: Number, min: 0, max: 1 },

    failureReason: { type: String, maxlength: 280 },
    /**
     * Set only on a refund reversal that left the balance below zero: how far
     * below, in paise, immediately after this row (plan.md §4.4). Lets the
     * ledger itself explain a negative balance instead of leaving it to be
     * inferred from arithmetic. Absent on every other row.
     */
    overdraftMinor: { type: Number, min: 0 },
    /**
     * Present only on `source: 'adjustment'` rows (plan.md §28.2, §29.3 rule 3):
     * who made the correction and why. `kind: 'manual'` is an operator moving
     * money (settled, through `ledgerService.applyAdjustment`); `kind: 'repair'`
     * records a reconciliation repair (`settlement: 'none'` — see
     * `reconciliationService.repairAccountBalance` for why it is not summed).
     *
     * The reason is part of the customer's own record and is returned to them;
     * *who* made the change is not — `actorId` is `select: false`, so the
     * customer's history and data export never carry a staff member's id.
     * Admin reads opt in with `.select('+adjustment.actorId')`.
     */
    adjustment: {
        kind: { type: String, enum: ['manual', 'repair'] },
        reason: { type: String, maxlength: 280 },
        actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', select: false },
        previousBalance: Number,
        correctedBalance: Number,
    },
    refund: {
        refundedAmount: { type: Number, default: 0 },
        refunds: [{ refundId: String, amount: Number, at: Date }],
    },

    /** Business timestamp for bucketing. Distinct from `createdAt` so a future
     *  backdated correction has somewhere to live without lying about when the
     *  row was written. Defaults to creation time, which is the only value
     *  every write path today can offer honestly. */
    postedAt: { type: Date, default: Date.now },
}, { timestamps: true });

/**
 * Every read path filters by userId and sorts by createdAt desc. Without this
 * compound index each dashboard load is a full collection scan.
 */
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ userId: 1, type: 1, createdAt: -1 });
transactionSchema.index({ userId: 1, category: 1, createdAt: -1 });
transactionSchema.index({ userId: 1, status: 1, createdAt: -1 });
transactionSchema.index({ userId: 1, settlement: 1, type: 1, createdAt: -1 });
transactionSchema.index({ transferGroupId: 1 }, { sparse: true });
transactionSchema.index({ paymentRef: 1 }, { sparse: true });
transactionSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

export default mongoose.model('Transaction', transactionSchema);
