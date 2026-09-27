import mongoose from 'mongoose';

/**
 * A self-reported investment (plan.md §21): the holder records what they own
 * and what they think it is worth, and PayPro adds it up.
 *
 * Nothing here is market data. There is no price feed (that needs a market-data
 * licence and legal review, §21), no execution and no advice. `currentValueMinor`
 * is whatever the holder last typed, and `valueUpdatedAt` says when — the UI
 * shows that date next to every value, because a stale self-reported number
 * must never look like a live quote.
 *
 * Never touches the ledger or a balance.
 */
export const ASSET_TYPES = ['mf', 'stock', 'etf', 'fd', 'bond', 'gold', 'other'];

const holdingSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assetType: { type: String, enum: ASSET_TYPES, required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    /** Optional ticker, ISIN or folio — the holder's own label, never looked up. */
    identifier: { type: String, trim: true, maxlength: 40, default: '' },
    units: { type: Number, min: 0, default: null },
    costBasisMinor: { type: Number, min: 0, required: true },
    currentValueMinor: { type: Number, min: 0, required: true },
    valueUpdatedAt: { type: Date, required: true },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
    archivedAt: { type: Date, default: null },
}, { timestamps: true });

holdingSchema.index({ userId: 1, archivedAt: 1, assetType: 1 });

export default mongoose.model('Holding', holdingSchema);
