import express from 'express';
import { MAX_DOCUMENT_BYTES } from '../services/secureDocumentService.js';

/**
 * Document uploads (Phase 5) arrive as the raw file body — `Content-Type` is
 * the file's own type and the name travels in `X-File-Name` — rather than as
 * multipart form data. That needs no parsing dependency, keeps the global 100 KB
 * JSON limit untouched for every other route, and gives the handler a Buffer.
 *
 * The declared type only gets the body parsed; `secureDocumentService` decides
 * what the file actually is from its bytes.
 */
export const rawDocumentBody = express.raw({
    type: ['application/pdf', 'image/jpeg', 'image/png', 'application/octet-stream'],
    limit: MAX_DOCUMENT_BYTES,
});

/** What an upload handler passes to a service. */
export const uploadedFile = (req) => ({
    buffer: Buffer.isBuffer(req.body) ? req.body : null,
    fileName: req.get('x-file-name') || '',
    type: typeof req.query.type === 'string' ? req.query.type : '',
});

/**
 * Send a decrypted document. Never cached anywhere, never guessed at by the
 * browser, and shown inline so it opens in the reviewer's tab instead of
 * landing in a downloads folder.
 */
export const sendDocument = (res, { contentType, buffer, meta }) => {
    const extension = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }[contentType] ?? 'bin';
    res.set({
        'Content-Type': contentType,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'no-store, private',
        Pragma: 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `inline; filename="${meta.type}.${extension}"`,
    });
    res.status(200).end(buffer);
};
