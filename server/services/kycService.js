import User from '../models/User.js';
import KycSubmission from '../models/KycSubmission.js';
import KycDecision from '../models/KycDecision.js';
import AmlAlert from '../models/AmlAlert.js';
import { runInTransaction } from './ledgerService.js';
import { limitsForTier } from './limitService.js';
import {
    storeDocument, listDocuments, countDocuments, readDocument, removeDocument,
} from './secureDocumentService.js';
import { screenSubmission, checkSharedPan, listUserAlerts } from './amlService.js';
import { notifyUser } from './notificationService.js';
import { sendEmailAlert } from './emailService.js';
import { audit } from './auditService.js';
import { AUDIT } from '../models/AuditLog.js';
import { encryptField, decryptField, fingerprint, maskPan } from '../utils/fieldEncryption.js';
import { DomainError } from '../utils/domainError.js';
import {
    KYC_STATUS, KYC_DECISIONS, KYC_METHODS, KYC_GRANTABLE_TIERS, KYC_DOCUMENT_TYPES,
    MAX_DOCUMENTS_PER_SUBMISSION, PAN_PATTERN, canTransition,
} from '../constants/kyc.js';
import logger from '../utils/logger.js';

/**
 * The internal, admin-controlled identity-verification workflow (plan.md
 * §0.20.2). No third-party KYC provider: the application owns the submission,
 * the evidence, the queue, the state machine, the decision and its audit
 * trail. **The verification procedure itself is not in here** — an admin
 * clicking "Mark as Verified" records the outcome of a procedure compliance has
 * to approve (§0.20.1, Appendix B Q9). That approval is the go-live gate, not
 * this code.
 *
 * Invariants:
 *   - `User.kycTier` is raised **only** by a VERIFIED decision, and any move out
 *     of VERIFIED returns it to `unverified` in the same transaction.
 *   - Every decision is a compare-and-set on the submission's status *and* the
 *     reviewer who claimed it, so two reviewers can never both decide one
 *     submission and a decision on a submission that has since changed is
 *     refused.
 *   - Staff never review their own submission.
 *   - Every decision writes an append-only `KycDecision` (no TTL) as well as an
 *     `AuditLog` entry.
 *   - No PAN, Aadhaar digits or document contents reach a log line, an audit
 *     entry, a notification, or the AI service.
 */

const DOCS = 'kyc';
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const str = (value, max) => (typeof value === 'string' && value.trim() && value.trim().length <= max ? value.trim() : null);

/**
 * Validate and normalise what the holder typed. Throws a DomainError naming the
 * first problem, so the form can say exactly what to fix.
 */
export const parseApplicant = (body = {}, { now = new Date() } = {}) => {
    const legalName = str(body.legalName, 120);
    if (!legalName || legalName.length < 2 || !/^[\p{L}][\p{L} .'-]*$/u.test(legalName)) {
        throw new DomainError('INVALID_NAME', 'Enter your full legal name as it appears on your PAN card', 400);
    }

    const dobRaw = str(body.dateOfBirth, 10);
    const dateOfBirth = dobRaw && /^\d{4}-\d{2}-\d{2}$/.test(dobRaw) ? new Date(`${dobRaw}T00:00:00.000Z`) : null;
    if (!dateOfBirth || Number.isNaN(dateOfBirth.getTime()) || dateOfBirth.toISOString().slice(0, 10) !== dobRaw) {
        throw new DomainError('INVALID_DOB', 'Enter your date of birth', 400);
    }
    const ageYears = (now - dateOfBirth) / (365.25 * DAY_MS);
    if (ageYears < 18) throw new DomainError('UNDERAGE', 'You must be 18 or older to verify your identity', 400);
    if (ageYears > 120) throw new DomainError('INVALID_DOB', 'Check your date of birth', 400);

    const address = body.address ?? {};
    const line1 = str(address.line1, 120);
    const city = str(address.city, 60);
    const state = str(address.state, 60);
    const postalCode = str(address.postalCode, 6);
    if (!line1 || !city || !state) throw new DomainError('INVALID_ADDRESS', 'Enter your full address', 400);
    if (!postalCode || !/^[1-9][0-9]{5}$/.test(postalCode)) throw new DomainError('INVALID_PIN', 'Enter a valid 6-digit PIN code', 400);

    const pan = typeof body.pan === 'string' ? body.pan.replace(/\s/g, '').toUpperCase() : '';
    if (!PAN_PATTERN.test(pan)) throw new DomainError('INVALID_PAN', 'Enter a valid PAN (for example ABCDE1234F)', 400);

    let aadhaarLast4 = null;
    if (body.aadhaarLast4 !== undefined && body.aadhaarLast4 !== null && body.aadhaarLast4 !== '') {
        aadhaarLast4 = typeof body.aadhaarLast4 === 'string' ? body.aadhaarLast4.trim() : '';
        if (!/^\d{4}$/.test(aadhaarLast4)) {
            throw new DomainError('INVALID_AADHAAR', 'Enter only the last 4 digits of your Aadhaar number', 400);
        }
    }

    return {
        applicant: {
            legalName: legalName.replace(/\s+/g, ' '),
            dateOfBirth,
            address: { line1, line2: str(address.line2, 120) || '', city, state, postalCode },
        },
        identifiers: {
            panMasked: maskPan(pan),
            panEncrypted: encryptField(pan),
            panFingerprint: fingerprint('pan', pan),
            aadhaarMasked: aadhaarLast4 ? `XXXX XXXX ${aadhaarLast4}` : null,
        },
    };
};

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

/**
 * What the holder sees of their own case. No staff ids, no screening result,
 * no internal notes, and identifiers only in masked form.
 */
export const customerView = (submission, documents = []) => {
    if (!submission) return null;
    return {
        _id: submission._id,
        status: submission.status,
        submittedAt: submission.submittedAt,
        submissionCount: submission.submissionCount,
        applicant: submission.applicant,
        identifiers: {
            panMasked: submission.identifiers?.panMasked ?? null,
            aadhaarMasked: submission.identifiers?.aadhaarMasked ?? null,
        },
        requestedActions: submission.requestedActions ?? [],
        userVisibleReason: submission.userVisibleReason ?? '',
        decidedAt: submission.decidedAt,
        grantedTier: submission.grantedTier,
        history: (submission.statusHistory ?? []).map(({ from, to, at }) => ({ from, to, at })),
        documents,
        /** Documents can be added or removed only before a reviewer picks it up. */
        editable: [KYC_STATUS.PENDING, KYC_STATUS.REQUIRES_ACTION].includes(submission.status),
    };
};

export const getMine = async (userId) => {
    const [user, submission] = await Promise.all([
        User.findById(userId).select('kycTier').lean(),
        KycSubmission.findOne({ userId }).lean(),
    ]);
    const documents = submission ? await listDocuments({ purpose: DOCS, refId: submission._id }) : [];
    const tier = user?.kycTier ?? 'unverified';
    return { submission: customerView(submission, documents), tier, limits: limitsForTier(tier) };
};

/** Whether this account has a current VERIFIED identity — the gate for withdrawals. */
export const isVerified = async (userId) => {
    const [user, submission] = await Promise.all([
        User.findById(userId).select('kycTier').lean(),
        KycSubmission.findOne({ userId }).select('status').lean(),
    ]);
    return Boolean(user && user.kycTier !== 'unverified' && submission?.status === KYC_STATUS.VERIFIED);
};

// ---------------------------------------------------------------------------
// Holder actions
// ---------------------------------------------------------------------------

const afterSubmit = (submission, panFingerprint) => {
    // Screening and the shared-PAN check are shadow-mode AML (amlService):
    // they raise alerts for a reviewer and never change what the holder sees.
    Promise.all([
        screenSubmission(submission),
        checkSharedPan({ userId: submission.userId, panFingerprint }),
    ]).catch((err) => logger.error('KYC screening failed', { err, submissionId: String(submission._id) }));
};

/**
 * A first submission, or a fresh one after a rejection. A submission that is
 * already pending, in review or verified is refused: the holder should add
 * documents or wait, not start over.
 */
export const submit = async (userId, body, { req } = {}) => {
    const parsed = parseApplicant(body);
    const existing = await KycSubmission.findOne({ userId }).lean();
    const now = new Date();

    let submission;
    if (!existing) {
        submission = await KycSubmission.create({
            userId,
            status: KYC_STATUS.PENDING,
            submittedAt: now,
            ...parsed,
            statusHistory: [{ from: null, to: KYC_STATUS.PENDING, at: now, reason: 'Submitted' }],
        });
    } else if (existing.status === KYC_STATUS.REJECTED) {
        submission = await transitionForHolder(existing, parsed, 'New submission after rejection');
    } else {
        const message = {
            [KYC_STATUS.PENDING]: 'Your details are already waiting for review. You can still add documents.',
            [KYC_STATUS.UNDER_REVIEW]: 'Your details are being reviewed now.',
            [KYC_STATUS.VERIFIED]: 'Your identity is already verified.',
            [KYC_STATUS.REQUIRES_ACTION]: 'Update your details and resubmit instead.',
        }[existing.status];
        throw new DomainError('SUBMISSION_EXISTS', message, 409);
    }

    audit(AUDIT.KYC_SUBMITTED, {
        userId, req,
        target: { type: 'KycSubmission', id: String(submission._id) },
        metadata: { submissionCount: submission.submissionCount, previousStatus: existing?.status ?? null },
    });
    afterSubmit(submission, parsed.identifiers.panFingerprint);
    return getMine(userId);
};

/**
 * Resubmit after REQUIRES_ACTION, or correct details while still PENDING (before
 * anyone has picked it up — changing what a reviewer is looking at is refused).
 */
export const resubmit = async (userId, submissionId, body, { req } = {}) => {
    const parsed = parseApplicant(body);
    const existing = await KycSubmission.findOne({ _id: submissionId, userId }).lean();
    if (!existing) throw new DomainError('NOT_FOUND', 'Submission not found', 404);

    let submission;
    if (existing.status === KYC_STATUS.REQUIRES_ACTION) {
        submission = await transitionForHolder(existing, parsed, 'Resubmitted with changes');
    } else if (existing.status === KYC_STATUS.PENDING) {
        submission = await KycSubmission.findOneAndUpdate(
            { _id: existing._id, status: KYC_STATUS.PENDING },
            { $set: { ...parsed, submittedAt: new Date() } },
            { new: true }
        );
        if (!submission) throw new DomainError('IN_REVIEW', 'A reviewer has just picked this up. Wait for their decision.', 409);
    } else {
        throw new DomainError('NOT_EDITABLE', 'This submission cannot be changed now', 409);
    }

    audit(AUDIT.KYC_SUBMITTED, {
        userId, req,
        target: { type: 'KycSubmission', id: String(submission._id) },
        metadata: { submissionCount: submission.submissionCount, previousStatus: existing.status },
    });
    afterSubmit(submission, parsed.identifiers.panFingerprint);
    return getMine(userId);
};

const transitionForHolder = async (existing, parsed, reason) => {
    if (!canTransition(existing.status, KYC_STATUS.PENDING)) {
        throw new DomainError('INVALID_TRANSITION', 'This submission cannot be resubmitted now', 409);
    }
    const now = new Date();
    const submission = await KycSubmission.findOneAndUpdate(
        { _id: existing._id, status: existing.status },
        {
            $set: {
                ...parsed,
                status: KYC_STATUS.PENDING,
                submittedAt: now,
                requestedActions: [],
                userVisibleReason: '',
                assignedTo: null,
                claimedAt: null,
            },
            $inc: { submissionCount: 1 },
            $push: { statusHistory: { from: existing.status, to: KYC_STATUS.PENDING, at: now, reason } },
        },
        { new: true }
    );
    if (!submission) throw new DomainError('CHANGED', 'This submission changed while you were editing it. Refresh and try again.', 409);
    return submission;
};

const editableSubmission = async (userId, submissionId) => {
    const submission = await KycSubmission.findOne({ _id: submissionId, userId }).select('status').lean();
    if (!submission) throw new DomainError('NOT_FOUND', 'Submission not found', 404);
    if (![KYC_STATUS.PENDING, KYC_STATUS.REQUIRES_ACTION].includes(submission.status)) {
        throw new DomainError('NOT_EDITABLE', 'Documents can only be changed before a reviewer picks up your submission', 409);
    }
    return submission;
};

export const addDocument = async (userId, submissionId, { type, fileName, buffer }, { req } = {}) => {
    if (!KYC_DOCUMENT_TYPES.includes(type)) throw new DomainError('INVALID_TYPE', 'Choose what kind of document this is', 400);
    await editableSubmission(userId, submissionId);
    if (await countDocuments({ purpose: DOCS, refId: submissionId }) >= MAX_DOCUMENTS_PER_SUBMISSION) {
        throw new DomainError('TOO_MANY_DOCUMENTS', `You can upload up to ${MAX_DOCUMENTS_PER_SUBMISSION} documents`, 409);
    }

    const document = await storeDocument({ ownerId: userId, purpose: DOCS, refId: submissionId, type, fileName, buffer });
    audit(AUDIT.KYC_DOCUMENT_UPLOADED, {
        userId, req,
        target: { type: 'KycSubmission', id: String(submissionId) },
        metadata: { documentId: String(document._id), documentType: type, size: document.size },
    });
    return document;
};

export const deleteDocument = async (userId, submissionId, documentId, { req } = {}) => {
    await editableSubmission(userId, submissionId);
    await removeDocument({ documentId, ownerId: userId, purpose: DOCS, refId: submissionId });
    audit(AUDIT.KYC_DOCUMENT_REMOVED, {
        userId, req,
        target: { type: 'KycSubmission', id: String(submissionId) },
        metadata: { documentId: String(documentId) },
    });
};

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

export const listQueue = async ({ status = KYC_STATUS.PENDING, page = 1, limit = 25 } = {}) => {
    const query = status === 'all' ? {} : { status };
    const [rows, total] = await Promise.all([
        KycSubmission.find(query)
            .sort({ submittedAt: 1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .select('userId status submittedAt submissionCount applicant.legalName assignedTo claimedAt screening decidedAt')
            .populate('userId', 'firstName lastName email')
            .populate('assignedTo', 'firstName lastName email')
            .lean(),
        KycSubmission.countDocuments(query),
    ]);

    const docCounts = await Promise.all(rows.map((row) => countDocuments({ purpose: DOCS, refId: row._id })));
    return {
        submissions: rows.map((row, i) => ({ ...row, documentCount: docCounts[i] })),
        total,
        page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
};

/** Everything a reviewer needs on one screen. Reading it is a PII access. */
export const getForReview = async (submissionId, { actorId, req } = {}) => {
    const submission = await KycSubmission.findById(submissionId)
        .populate('userId', 'firstName lastName email emailVerified status kycTier role createdAt')
        .populate('assignedTo', 'firstName lastName email')
        .populate('decidedBy', 'firstName lastName email')
        .populate('statusHistory.actorId', 'firstName lastName email')
        .lean();
    if (!submission) throw new DomainError('NOT_FOUND', 'Submission not found', 404);

    const subjectId = submission.userId?._id;
    const [documents, decisions, amlAlerts, sharedPanAccounts] = await Promise.all([
        listDocuments({ purpose: DOCS, refId: submission._id }),
        KycDecision.find({ submissionId: submission._id }).sort({ at: -1 }).populate('actorId', 'firstName lastName email').lean(),
        listUserAlerts(subjectId),
        submission.identifiers?.panFingerprint
            ? KycSubmission.countDocuments({ 'identifiers.panFingerprint': submission.identifiers.panFingerprint, userId: { $ne: subjectId } })
            : 0,
    ]);

    audit(AUDIT.ADMIN_PII_ACCESSED, {
        userId: actorId, req,
        target: { type: 'KycSubmission', id: String(submission._id) },
        metadata: { resource: 'kyc_submission' },
    });

    return {
        submission: { ...submission, isOwn: String(subjectId) === String(actorId) },
        documents,
        decisions,
        amlAlerts,
        sharedPanAccounts,
    };
};

const refuseOwn = (submission, actorId) => {
    if (String(submission.userId?._id ?? submission.userId) === String(actorId)) {
        throw new DomainError('SELF_REVIEW', 'Another reviewer has to handle your own submission', 403);
    }
};

const pushHistory = (from, to, actorId, reason) => ({ statusHistory: { from, to, at: new Date(), actorId, reason } });

export const claim = async (submissionId, { actorId, req }) => {
    const existing = await KycSubmission.findById(submissionId).select('userId status').lean();
    if (!existing) throw new DomainError('NOT_FOUND', 'Submission not found', 404);
    refuseOwn(existing, actorId);

    const submission = await KycSubmission.findOneAndUpdate(
        { _id: submissionId, status: KYC_STATUS.PENDING },
        {
            $set: { status: KYC_STATUS.UNDER_REVIEW, assignedTo: actorId, claimedAt: new Date() },
            $push: pushHistory(KYC_STATUS.PENDING, KYC_STATUS.UNDER_REVIEW, actorId, 'Review started'),
        },
        { new: true }
    );
    if (!submission) throw new DomainError('NOT_PENDING', 'Someone else has already picked this up, or it is not waiting for review', 409);

    audit(AUDIT.KYC_REVIEW_STARTED, {
        userId: actorId, req,
        target: { type: 'KycSubmission', id: String(submission._id) },
        metadata: { subjectUserId: String(submission.userId) },
    });
    return submission;
};

/** Hand a claimed submission back to the queue undecided. Only the reviewer who holds it can. */
export const release = async (submissionId, { actorId, reason = '', req }) => {
    const submission = await KycSubmission.findOneAndUpdate(
        { _id: submissionId, status: KYC_STATUS.UNDER_REVIEW, assignedTo: actorId },
        {
            $set: { status: KYC_STATUS.PENDING, assignedTo: null, claimedAt: null },
            $push: pushHistory(KYC_STATUS.UNDER_REVIEW, KYC_STATUS.PENDING, actorId, reason || 'Returned to the queue'),
        },
        { new: true }
    );
    if (!submission) throw new DomainError('NOT_YOURS', 'Only the reviewer who picked this up can return it', 409);

    audit(AUDIT.KYC_REVIEW_RELEASED, {
        userId: actorId, req,
        target: { type: 'KycSubmission', id: String(submission._id) },
        metadata: { subjectUserId: String(submission.userId) },
    });
    return submission;
};

const OUTCOME = {
    [KYC_STATUS.VERIFIED]: {
        audit: AUDIT.KYC_VERIFIED,
        title: 'Your identity is verified',
        body: (s) => `Your identity has been verified. Your account limits have been raised${s.grantedTier ? ` to the ${s.grantedTier} tier` : ''}.`,
    },
    [KYC_STATUS.REJECTED]: {
        audit: AUDIT.KYC_REJECTED,
        title: 'We could not verify your identity',
        body: (s) => `We could not verify your identity: ${s.userVisibleReason} You can submit again from your account.`,
    },
    [KYC_STATUS.REQUIRES_ACTION]: {
        audit: AUDIT.KYC_ACTION_REQUIRED,
        title: 'Action needed to verify your identity',
        body: (s) => `We need something more to verify your identity: ${s.userVisibleReason} Open Identity verification in your account to update it.`,
    },
};

const parseDecisionInput = ({ status, method, reference, notes, userVisibleReason, requestedActions, tier }) => {
    if (!KYC_DECISIONS.includes(status)) throw new DomainError('INVALID_DECISION', 'Choose Verified, Rejected or Request action', 400);
    const cleanNotes = str(notes, 2000);
    if (!cleanNotes || cleanNotes.length < 10) {
        throw new DomainError('NOTES_REQUIRED', 'Record what you checked and why (at least 10 characters)', 400);
    }
    const visible = str(userVisibleReason, 500) || '';
    const actions = Array.isArray(requestedActions)
        ? requestedActions.map((a) => str(a, 200)).filter(Boolean).slice(0, 10)
        : [];

    if (status === KYC_STATUS.VERIFIED) {
        if (!KYC_METHODS.includes(method)) throw new DomainError('METHOD_REQUIRED', 'Record how the identity was verified', 400);
        if (!KYC_GRANTABLE_TIERS.includes(tier)) throw new DomainError('TIER_REQUIRED', 'Choose the tier the completed checks support', 400);
    } else if (!visible) {
        throw new DomainError('REASON_REQUIRED', 'Write the reason the customer will see', 400);
    }
    if (status === KYC_STATUS.REQUIRES_ACTION && !actions.length) {
        throw new DomainError('ACTIONS_REQUIRED', 'List at least one thing the customer needs to do', 400);
    }

    return {
        status,
        method: KYC_METHODS.includes(method) ? method : null,
        reference: str(reference, 80) || '',
        notes: cleanNotes,
        userVisibleReason: visible,
        requestedActions: status === KYC_STATUS.REQUIRES_ACTION ? actions : [],
        tier: status === KYC_STATUS.VERIFIED ? tier : 'unverified',
    };
};

/**
 * The shared write for a decision and a revocation: the submission, the tier
 * and the append-only decision record, in one transaction. `filter` is the
 * compare-and-set.
 */
const recordDecision = async ({ submissionId, filter, from, input, actorId, req }) => {
    const now = new Date();
    const result = await runInTransaction(async (session) => {
        const submission = await KycSubmission.findOneAndUpdate(
            { _id: submissionId, ...filter },
            {
                $set: {
                    status: input.status,
                    decidedAt: now,
                    decidedBy: actorId,
                    method: input.method,
                    userVisibleReason: input.userVisibleReason,
                    requestedActions: input.requestedActions,
                    grantedTier: input.status === KYC_STATUS.VERIFIED ? input.tier : null,
                    assignedTo: null,
                    claimedAt: null,
                },
                $push: pushHistory(from, input.status, actorId, input.userVisibleReason || 'Verified'),
            },
            { new: true, session }
        );
        if (!submission) return null;

        // Read inside the transaction, so tierBefore is the value this write replaces.
        const user = await User.findById(submission.userId).select('kycTier email firstName preferences').session(session);
        const tierBefore = user?.kycTier ?? 'unverified';
        await User.updateOne({ _id: submission.userId }, { $set: { kycTier: input.tier } }, { session });

        const [decision] = await KycDecision.create([{
            userId: submission.userId,
            submissionId: submission._id,
            actorId,
            at: now,
            previousStatus: from,
            newStatus: input.status,
            method: input.method,
            reference: input.reference,
            notes: input.notes,
            userVisibleReason: input.userVisibleReason,
            tierBefore,
            tierAfter: input.tier,
            requestId: req?.id ?? null,
        }], { session });

        return { submission, decision, user, tierBefore };
    });

    if (!result) return null;

    const { submission, decision, user, tierBefore } = result;
    const outcome = OUTCOME[input.status];
    audit(outcome.audit, {
        userId: actorId, req,
        target: { type: 'KycSubmission', id: String(submission._id) },
        metadata: {
            subjectUserId: String(submission.userId),
            decisionId: String(decision._id),
            previousStatus: from,
            newStatus: input.status,
            method: input.method,
            reference: input.reference,
            tierBefore,
            tierAfter: input.tier,
        },
    });

    // An outcome the holder cannot mute (the 'Account' type), and an email that
    // ignores emailAlerts. Neither carries an identifier or internal notes.
    const body = outcome.body(submission);
    notifyUser(submission.userId, 'Account', outcome.title, body, { kycStatus: input.status }).catch(() => {});
    if (user) sendEmailAlert(user, 'accountUpdate', { title: outcome.title, body });

    return { submission, decision };
};

/**
 * "Mark as Verified" / "Reject" / "Request action" (plan.md §0.20.2 step 4).
 * The route re-authenticates the admin before this runs.
 */
export const decide = async (submissionId, body, { actorId, req }) => {
    const input = parseDecisionInput(body);
    const existing = await KycSubmission.findById(submissionId).select('userId status assignedTo').lean();
    if (!existing) throw new DomainError('NOT_FOUND', 'Submission not found', 404);
    refuseOwn(existing, actorId);
    if (existing.status !== KYC_STATUS.UNDER_REVIEW) {
        throw new DomainError('NOT_UNDER_REVIEW', 'Pick this submission up before deciding it', 409);
    }
    if (String(existing.assignedTo) !== String(actorId)) {
        throw new DomainError('NOT_YOURS', 'Another reviewer is handling this submission', 409);
    }

    if (input.status === KYC_STATUS.VERIFIED) {
        // Evidence first: a verification with nothing on file is a click, not a check.
        if (!(await countDocuments({ purpose: DOCS, refId: submissionId }))) {
            throw new DomainError('NO_DOCUMENTS', 'There are no documents on file to verify against. Request them instead.', 409);
        }
        // A possible watchlist match must be looked at before the account is trusted more.
        if (await AmlAlert.exists({ userId: existing.userId, rule: 'WATCHLIST_MATCH', status: 'open' })) {
            throw new DomainError('SCREENING_OPEN', 'Close the open watchlist alert for this customer first', 409);
        }
    }

    const result = await recordDecision({
        submissionId,
        filter: { status: KYC_STATUS.UNDER_REVIEW, assignedTo: actorId },
        from: KYC_STATUS.UNDER_REVIEW,
        input,
        actorId,
        req,
    });
    if (!result) throw new DomainError('CHANGED', 'This submission changed while you were reviewing it. Reload it.', 409);
    return result;
};

/**
 * Take a verification back (VERIFIED → REQUIRES_ACTION): a document found to be
 * forged, an expired identity document, a periodic re-verification. The tier
 * returns to `unverified` in the same write.
 */
export const revoke = async (submissionId, body, { actorId, req }) => {
    const input = parseDecisionInput({ ...body, status: KYC_STATUS.REQUIRES_ACTION });
    const existing = await KycSubmission.findById(submissionId).select('userId status').lean();
    if (!existing) throw new DomainError('NOT_FOUND', 'Submission not found', 404);
    refuseOwn(existing, actorId);

    const result = await recordDecision({
        submissionId,
        filter: { status: KYC_STATUS.VERIFIED },
        from: KYC_STATUS.VERIFIED,
        input,
        actorId,
        req,
    });
    if (!result) throw new DomainError('NOT_VERIFIED', 'Only a verified submission can be revoked', 409);
    return result;
};

/** A document for a reviewer. Every open is audited (§28.3 rule 6). */
export const readDocumentForReview = async (submissionId, documentId, { actorId, req }) => {
    const file = await readDocument({ documentId, purpose: DOCS, refId: submissionId });
    audit(AUDIT.KYC_DOCUMENT_VIEWED, {
        userId: actorId, req,
        target: { type: 'KycSubmission', id: String(submissionId) },
        metadata: { documentId: String(documentId), documentType: file.meta.type },
    });
    return file;
};

/** The full PAN, for comparing against the card. Audited like a document. */
export const revealPan = async (submissionId, { actorId, req }) => {
    const submission = await KycSubmission.findById(submissionId).select('+identifiers.panEncrypted').lean();
    if (!submission?.identifiers?.panEncrypted) throw new DomainError('NOT_FOUND', 'Submission not found', 404);
    audit(AUDIT.ADMIN_PII_ACCESSED, {
        userId: actorId, req,
        target: { type: 'KycSubmission', id: String(submissionId) },
        metadata: { resource: 'kyc_pan' },
    });
    return decryptField(submission.identifiers.panEncrypted);
};

export default {
    parseApplicant, customerView, getMine, isVerified, submit, resubmit, addDocument, deleteDocument,
    listQueue, getForReview, claim, release, decide, revoke, readDocumentForReview, revealPan,
};
