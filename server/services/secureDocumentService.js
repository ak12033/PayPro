import crypto from 'crypto';
import SecureDocument from '../models/SecureDocument.js';
import { encryptBuffer, decryptBuffer } from '../utils/fieldEncryption.js';
import { DomainError } from '../utils/domainError.js';

/**
 * The encrypted document store behind KYC and bank-account proof (plan.md
 * §0.20.2). Every other module goes through this one; nothing else reads
 * `SecureDocument.data`.
 */

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

/**
 * The file type from its first bytes, never from the declared Content-Type or
 * the file name — both are whatever the uploader said. A renamed executable is
 * refused here rather than stored and later handed to a reviewer's browser.
 */
export const sniffContentType = (buffer) => {
    if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;
    if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
    if (buffer[0] === 0x89 && buffer.subarray(1, 4).toString('latin1') === 'PNG') return 'image/png';
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    return null;
};

/** The uploader's label, made safe to store and display: no path, no control characters. */
export const cleanFileName = (raw) => {
    let name = '';
    try {
        name = decodeURIComponent(String(raw ?? ''));
    } catch {
        name = String(raw ?? '');
    }
    return name
        .replace(/^.*[\\/]/, '')
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
        .trim()
        .slice(0, 120);
};

/** Metadata only — what a list shows. Never the bytes. */
export const describe = (doc) => ({
    _id: doc._id,
    type: doc.type,
    fileName: doc.fileName,
    contentType: doc.contentType,
    size: doc.size,
    uploadedAt: doc.createdAt,
});

export const storeDocument = async ({ ownerId, purpose, refId, type, fileName, buffer }) => {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new DomainError('EMPTY_FILE', 'Choose a file to upload', 400);
    }
    if (buffer.length > MAX_DOCUMENT_BYTES) {
        throw new DomainError('FILE_TOO_LARGE', 'Files can be at most 5 MB', 413);
    }
    const contentType = sniffContentType(buffer);
    if (!contentType) {
        throw new DomainError('UNSUPPORTED_FILE', 'Upload a PDF, JPEG or PNG file', 415);
    }

    const sealed = encryptBuffer(buffer);
    const doc = await SecureDocument.create({
        ownerId,
        purpose,
        refId,
        type,
        fileName: cleanFileName(fileName),
        contentType,
        size: buffer.length,
        sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
        ...sealed,
    });
    return describe(doc);
};

export const listDocuments = async ({ purpose, refId }) => {
    const docs = await SecureDocument.find({ purpose, refId, removedAt: null }).sort({ createdAt: 1 }).lean();
    return docs.map(describe);
};

export const countDocuments = ({ purpose, refId }) =>
    SecureDocument.countDocuments({ purpose, refId, removedAt: null });

/**
 * Decrypt one document for an authorised caller. The caller is responsible for
 * the authorisation and for auditing the access; this only guarantees the bytes
 * are the ones that were uploaded (GCM's tag, then the SHA-256).
 */
export const readDocument = async ({ documentId, purpose, refId }) => {
    const doc = await SecureDocument.findOne({ _id: documentId, purpose, refId, removedAt: null })
        .select('+iv +tag +data')
        .lean();
    if (!doc) throw new DomainError('DOCUMENT_NOT_FOUND', 'Document not found', 404);

    const buffer = decryptBuffer({ iv: doc.iv.buffer ?? doc.iv, tag: doc.tag.buffer ?? doc.tag, data: doc.data.buffer ?? doc.data });
    if (crypto.createHash('sha256').update(buffer).digest('hex') !== doc.sha256) {
        throw new DomainError('DOCUMENT_CORRUPT', 'This document failed its integrity check', 500);
    }
    return { meta: describe(doc), contentType: doc.contentType, buffer };
};

/**
 * Remove a document the owner uploaded. The bytes are deleted, not only hidden:
 * a document withdrawn before anyone reviewed it has no reason to be kept.
 */
export const removeDocument = async ({ documentId, ownerId, purpose, refId }) => {
    const result = await SecureDocument.updateOne(
        { _id: documentId, ownerId, purpose, refId, removedAt: null },
        { $set: { removedAt: new Date() }, $unset: { iv: 1, tag: 1, data: 1 } }
    );
    if (!result.matchedCount) throw new DomainError('DOCUMENT_NOT_FOUND', 'Document not found', 404);
};

export default { storeDocument, listDocuments, countDocuments, readDocument, removeDocument, sniffContentType, cleanFileName, MAX_DOCUMENT_BYTES };
