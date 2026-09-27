import mongoose from 'mongoose';

/**
 * One name on an imported watchlist. `nameKey` is the normalised, token-sorted
 * form `amlService.nameKey` produces — the thing screening compares — so
 * "SMITH, John" and "john smith" land on the same key.
 */
const watchlistEntrySchema = new mongoose.Schema({
    watchlistId: { type: mongoose.Schema.Types.ObjectId, ref: 'Watchlist', required: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    nameKey: { type: String, required: true },
    dateOfBirth: { type: Date, default: null },
    /** The list's own reference for this entry, e.g. a UN or MHA listing number. */
    reference: { type: String, trim: true, maxlength: 120, default: '' },
}, { timestamps: false, versionKey: false });

watchlistEntrySchema.index({ nameKey: 1, watchlistId: 1 });
watchlistEntrySchema.index({ watchlistId: 1 });

export default mongoose.model('WatchlistEntry', watchlistEntrySchema);
