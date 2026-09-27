import mongoose from 'mongoose';

/**
 * One imported version of a screening list (plan.md §30.3: "officially
 * published designated/sanctions lists imported and versioned internally").
 *
 * Which lists apply is a legal determination; this only stores whatever an
 * admin imports and says where it came from. Importing a list under an existing
 * `name` creates version n+1 and deactivates the previous version — the old
 * version and its entries are kept, so an alert raised against version 3 can
 * still be explained after version 4 arrives.
 */
const watchlistSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 120 },
    /** Where the file came from: the publishing authority and its URL or reference. */
    source: { type: String, required: true, trim: true, maxlength: 300 },
    version: { type: Number, required: true, min: 1 },
    active: { type: Boolean, default: true },
    entryCount: { type: Number, default: 0 },
    /** SHA-256 of the imported text, so the exact file can be identified later. */
    sha256: { type: String, required: true },
    importedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    /** Rows the parser could not use, reported back to the importer. */
    skippedRows: { type: Number, default: 0 },
}, { timestamps: true });

watchlistSchema.index({ name: 1, version: -1 }, { unique: true });
watchlistSchema.index({ active: 1 });

export default mongoose.model('Watchlist', watchlistSchema);
