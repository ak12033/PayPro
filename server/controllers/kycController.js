import { asyncHandler } from '../utils/asyncHandler.js';
import { asObjectId } from '../utils/sanitize.js';
import { uploadedFile } from '../utils/fileUpload.js';
import { DomainError } from '../utils/domainError.js';
import { getMine, submit, resubmit, addDocument, deleteDocument } from '../services/kycService.js';

/**
 * The holder's side of identity verification (plan.md §0.20.2). Every read and
 * write is scoped to `req.user.id` — the service looks submissions up by
 * `{ _id, userId }`, so an id from someone else's case matches nothing.
 */

const idParam = (value, what = 'submission') => {
    const id = asObjectId(value);
    if (!id) throw new DomainError('INVALID_ID', `A valid ${what} id is required`, 400);
    return id;
};

export const getMyKyc = asyncHandler(async (req, res) => {
    res.status(200).json(await getMine(req.user.id));
});

export const postSubmission = asyncHandler(async (req, res) => {
    res.status(201).json(await submit(req.user.id, req.body ?? {}, { req }));
});

export const postResubmission = asyncHandler(async (req, res) => {
    res.status(200).json(await resubmit(req.user.id, idParam(req.params.id), req.body ?? {}, { req }));
});

export const postDocument = asyncHandler(async (req, res) => {
    const document = await addDocument(req.user.id, idParam(req.params.id), uploadedFile(req), { req });
    res.status(201).json({ document });
});

export const removeDocument = asyncHandler(async (req, res) => {
    await deleteDocument(req.user.id, idParam(req.params.id), idParam(req.params.documentId, 'document'), { req });
    res.status(200).json({ message: 'Document removed' });
});
