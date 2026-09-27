import api from '../index';

/**
 * Identity verification, the holder's side (plan.md §0.20.2).
 *
 * A document is sent as the file itself — its own Content-Type, the label in
 * `X-File-Name` — not as multipart form data; the server decides what the file
 * really is from its bytes.
 */
export const kycApi = {
    getMine: () => api.get('/kyc/me'),
    submit: (details) => api.post('/kyc/submissions', details),
    resubmit: (id, details) => api.post(`/kyc/submissions/${id}/resubmit`, details),
    uploadDocument: (id, { type, file }) =>
        api.post(`/kyc/submissions/${id}/documents`, file, {
            params: { type },
            headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
        }),
    removeDocument: (id, documentId) => api.delete(`/kyc/submissions/${id}/documents/${documentId}`),
};

export default kycApi;
