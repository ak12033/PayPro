/**
 * Identity verification, as the client presents it (plan.md §0.20.2).
 *
 * The statuses, methods and document types mirror `server/constants/kyc.js`,
 * and `kyc.test.js` reads that file so the two cannot drift. The *wording* is
 * the client's: what each state means to the person looking at it, and what
 * they can do next.
 */

export const KYC_STATUS_META = {
    PENDING: { label: 'Waiting for review', tone: 'info', description: 'Your details are in the queue. We will tell you as soon as someone has looked at them.' },
    UNDER_REVIEW: { label: 'Being reviewed', tone: 'info', description: 'A member of our team is checking your details now.' },
    VERIFIED: { label: 'Verified', tone: 'positive', description: 'Your identity is verified.' },
    REJECTED: { label: 'Not verified', tone: 'negative', description: 'We could not verify your identity. You can submit again.' },
    REQUIRES_ACTION: { label: 'Action needed', tone: 'warning', description: 'We need something more from you before we can finish.' },
};

export const kycStatusMeta = (status) =>
    KYC_STATUS_META[status] ?? { label: 'Not started', tone: 'neutral', description: 'Verify your identity to raise your limits and withdraw to a bank account.' };

/** Placeholder methods pending compliance's approved procedure (plan.md §0.20.1). */
export const KYC_METHOD_LABEL = {
    document_review: 'Document review',
    video_call: 'Video call',
    in_person: 'In person',
    other: 'Other (describe in notes)',
};

export const KYC_DOCUMENT_LABEL = {
    pan_card: 'PAN card',
    aadhaar_card: 'Aadhaar card',
    passport: 'Passport',
    driving_licence: 'Driving licence',
    voter_id: 'Voter ID',
    address_proof: 'Proof of address',
    photo: 'Photograph',
    other: 'Other document',
};

export const BANK_DOCUMENT_LABEL = {
    cancelled_cheque: 'Cancelled cheque',
    bank_statement: 'Bank statement',
    passbook: 'Passbook first page',
};

export const TIER_LABEL = { unverified: 'Unverified', basic: 'Basic', full: 'Full' };

export const ACCEPTED_FILE_TYPES = 'application/pdf,image/jpeg,image/png';
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Client-side echo of the server's PAN check, so the form can say "that isn't a PAN" before a round trip. */
export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/**
 * The privacy line shown wherever identity data is collected. Worded as
 * commitments the code actually keeps: masked display, encryption at rest,
 * human review, nothing sent to the AI assistant.
 */
export const KYC_PRIVACY_NOTE =
    'Your PAN and documents are encrypted and only shown to the PayPro staff member reviewing them. We never ask for your full Aadhaar number, and none of this is shared with the AI assistant.';

export const WITHDRAWAL_STATUS_META = {
    requested: { label: 'Waiting for review', tone: 'info' },
    processing: { label: 'Being sent', tone: 'info' },
    paid: { label: 'Sent', tone: 'positive' },
    rejected: { label: 'Not approved', tone: 'negative' },
    failed: { label: 'Failed, money returned', tone: 'negative' },
    cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export const BANK_ACCOUNT_STATUS_META = {
    pending: { label: 'Being checked', tone: 'info' },
    verified: { label: 'Verified', tone: 'positive' },
    rejected: { label: 'Not verified', tone: 'negative' },
};
