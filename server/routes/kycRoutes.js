import express from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import { uploadLimiter, verificationLimiter } from '../middlewares/rateLimiters.js';
import { rawDocumentBody } from '../utils/fileUpload.js';
import {
    getMyKyc, postSubmission, postResubmission, postDocument, removeDocument,
} from '../controllers/kycController.js';

/**
 * Identity verification, the holder's side (plan.md §0.20.2). The review side
 * is under /api/admin/kyc.
 */
const kycRouter = express.Router();

kycRouter.use(authMiddleware);

kycRouter.get('/me', getMyKyc);
kycRouter.post('/submissions', verificationLimiter, postSubmission);
kycRouter.post('/submissions/:id/resubmit', verificationLimiter, postResubmission);
// Raw body: the file itself, `?type=` names the document, `X-File-Name` its label.
kycRouter.post('/submissions/:id/documents', uploadLimiter, rawDocumentBody, postDocument);
kycRouter.delete('/submissions/:id/documents/:documentId', removeDocument);

export default kycRouter;
