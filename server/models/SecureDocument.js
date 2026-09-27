import mongoose from 'mongoose';

/**
 * An encrypted file: a KYC identity document, or proof of a bank account
 * (plan.md §0.20.2 "secure document storage").
 *
 * The repository has no object storage (§42.2), and the decision on 2026-09-27
 * was to keep documents in MongoDB rather than add an external account:
 * AES-256-GCM under `PII_ENCRYPTION_KEY` (utils/fieldEncryption.js), capped at
 * 5 MB so a document stays well inside Mongo's 16 MB limit.
 *
 *   - `data`/`iv`/`tag` are `select: false`. Listing documents never loads
 *     their bytes; only `secureDocumentService.readDocument` asks for them, and
 *     every call to it is audited as a PII access.
 *   - There is no URL. A document is streamed to an authorised caller and
 *     nothing else — no public link, nothing cached (`Cache-Control: no-store`).
 *   - `fileName` is the uploader's own label, kept for the reviewer. It is never
 *     written to a log, an audit entry or a notification.
 */
const secureDocumentSchema = new mongoose.Schema({
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    /** What this document is evidence for. */
    purpose: { type: String, enum: ['kyc', 'bank_account'], required: true },
    /** The KycSubmission or BankAccount it belongs to. */
    refId: { type: mongoose.Schema.Types.ObjectId, required: true },
    type: { type: String, required: true, maxlength: 40 },
    fileName: { type: String, maxlength: 120, default: '' },
    contentType: { type: String, enum: ['application/pdf', 'image/jpeg', 'image/png'], required: true },
    size: { type: Number, required: true, min: 1 },
    /** SHA-256 of the plaintext: spots the same file uploaded twice, and proves integrity after decryption. */
    sha256: { type: String, required: true },
    iv: { type: Buffer, required: true, select: false },
    tag: { type: Buffer, required: true, select: false },
    data: { type: Buffer, required: true, select: false },
    /** Set when the uploader removes it before review. The bytes are deleted then too. */
    removedAt: { type: Date, default: null },
}, { timestamps: true });

secureDocumentSchema.index({ purpose: 1, refId: 1, removedAt: 1 });
secureDocumentSchema.index({ ownerId: 1, createdAt: -1 });

export default mongoose.model('SecureDocument', secureDocumentSchema);
