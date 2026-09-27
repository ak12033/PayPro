/**
 * The internal identity-verification workflow (plan.md §0.20.2).
 *
 * Explicit states, not a boolean. An account that has never submitted has *no
 * submission* ("Not started") — that is the absence of a workflow, not a sixth
 * status, and its `kycTier` stays `unverified`.
 */
export const KYC_STATUS = {
    PENDING: 'PENDING',
    UNDER_REVIEW: 'UNDER_REVIEW',
    VERIFIED: 'VERIFIED',
    REJECTED: 'REJECTED',
    REQUIRES_ACTION: 'REQUIRES_ACTION',
};

export const KYC_STATUSES = Object.values(KYC_STATUS);

/**
 * Legal next-states, refused otherwise (the same guard `ALLOWED_TRANSITIONS`
 * gives `Transaction.status`). Straight from §0.20.2's diagram, plus
 * UNDER_REVIEW → PENDING: a reviewer handing a claimed submission back to the
 * queue without deciding it, so a claim can never strand a submission.
 *
 *   (none) ──submit──▶ PENDING ──claim──▶ UNDER_REVIEW
 *   UNDER_REVIEW ──▶ VERIFIED | REJECTED | REQUIRES_ACTION | (release) PENDING
 *   REQUIRES_ACTION ──user resubmits──▶ PENDING
 *   REJECTED ──new submission──▶ PENDING
 *   VERIFIED ──revoked / re-verification due──▶ REQUIRES_ACTION
 */
export const KYC_TRANSITIONS = {
    [KYC_STATUS.PENDING]: [KYC_STATUS.UNDER_REVIEW],
    [KYC_STATUS.UNDER_REVIEW]: [KYC_STATUS.VERIFIED, KYC_STATUS.REJECTED, KYC_STATUS.REQUIRES_ACTION, KYC_STATUS.PENDING],
    [KYC_STATUS.REQUIRES_ACTION]: [KYC_STATUS.PENDING],
    [KYC_STATUS.REJECTED]: [KYC_STATUS.PENDING],
    [KYC_STATUS.VERIFIED]: [KYC_STATUS.REQUIRES_ACTION],
};

export const canTransition = (from, to) => Boolean(KYC_TRANSITIONS[from]?.includes(to));

/** The outcomes a reviewer can record from UNDER_REVIEW. */
export const KYC_DECISIONS = [KYC_STATUS.VERIFIED, KYC_STATUS.REJECTED, KYC_STATUS.REQUIRES_ACTION];

/**
 * How the reviewer verified the holder. **Placeholder values**: the permitted
 * procedures are a compliance determination (plan.md §0.20.1, Appendix B Q9),
 * and this list must be replaced by whatever that approval names. Recorded on
 * every decision so the audit trail says *how*, not only *who*.
 */
export const KYC_METHODS = ['document_review', 'video_call', 'in_person', 'other'];

/** Tiers a VERIFIED decision may grant. `unverified` is what leaving VERIFIED sets. */
export const KYC_GRANTABLE_TIERS = ['basic', 'full'];

/** Document types a user can upload as evidence. */
export const KYC_DOCUMENT_TYPES = [
    'pan_card',
    'aadhaar_card',
    'passport',
    'driving_licence',
    'voter_id',
    'address_proof',
    'photo',
    'other',
];

/** Bank-account proof, stored in the same encrypted document store. */
export const BANK_DOCUMENT_TYPES = ['cancelled_cheque', 'bank_statement', 'passbook'];

export const MAX_DOCUMENTS_PER_SUBMISSION = 8;

/** `AAAAA9999A` — five letters, four digits, one letter. */
export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
