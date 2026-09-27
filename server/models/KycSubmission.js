import mongoose from 'mongoose';
import { KYC_STATUSES, KYC_METHODS } from '../constants/kyc.js';

/**
 * A holder's identity-verification case (plan.md §0.20.2).
 *
 * One per user (the unique index below). A resubmission after REQUIRES_ACTION
 * or REJECTED reuses this document, and every state it has ever been in is on
 * `statusHistory`; every *decision* is also a row in the append-only
 * `KycDecision` collection, which is the record compliance relies on.
 *
 * What is stored, and how (the 2026-09-27 decision):
 *   - name, date of birth and address, in clear — the reviewer needs them and
 *     they are what screening runs on;
 *   - **PAN**: encrypted (`panEncrypted`, select:false), a masked form for every
 *     screen, and a keyed fingerprint so the same PAN on two accounts can be
 *     found without decrypting anything;
 *   - **Aadhaar**: only the last four digits, and only ever shown masked. The
 *     full number is never collected. An Aadhaar number on its own is not
 *     treated as proof of identity anywhere (§0.20.1) — the documents and the
 *     reviewer's recorded procedure are.
 *
 * `assignedTo` and `decidedBy` are staff ids and are stripped from anything the
 * customer reads (`kycService.customerView`), the same rule as
 * `adjustment.actorId`.
 */
const addressSchema = new mongoose.Schema({
    line1: { type: String, trim: true, maxlength: 120 },
    line2: { type: String, trim: true, maxlength: 120, default: '' },
    city: { type: String, trim: true, maxlength: 60 },
    state: { type: String, trim: true, maxlength: 60 },
    postalCode: { type: String, trim: true, maxlength: 6 },
}, { _id: false });

const kycSubmissionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: KYC_STATUSES, required: true },
    submittedAt: { type: Date, required: true },
    /** How many times the holder has submitted (1 on the first, +1 per resubmission). */
    submissionCount: { type: Number, default: 1 },

    applicant: {
        legalName: { type: String, trim: true, maxlength: 120, required: true },
        dateOfBirth: { type: Date, required: true },
        address: { type: addressSchema, required: true },
    },
    identifiers: {
        panMasked: { type: String, maxlength: 10 },
        panEncrypted: { type: String, select: false },
        panFingerprint: { type: String, index: true },
        /** e.g. `XXXX XXXX 1234`. The only Aadhaar data PayPro holds. */
        aadhaarMasked: { type: String, maxlength: 14, default: null },
    },

    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    claimedAt: { type: Date, default: null },

    /** What the holder must fix, in wording safe to show them. Set on REQUIRES_ACTION. */
    requestedActions: { type: [String], default: [] },
    /** The reason shown to the holder for the latest decision. Internal notes live on KycDecision. */
    userVisibleReason: { type: String, maxlength: 500, default: '' },
    decidedAt: { type: Date, default: null },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    method: { type: String, enum: [...KYC_METHODS, null], default: null },
    /** The tier the latest VERIFIED decision granted. Null outside VERIFIED. */
    grantedTier: { type: String, enum: ['basic', 'full', null], default: null },

    /** Set when screening found a possible watchlist match. Shown to reviewers only. */
    screening: {
        screenedAt: { type: Date, default: null },
        possibleMatches: { type: Number, default: 0 },
    },

    statusHistory: [{
        _id: false,
        from: { type: String, default: null },
        to: String,
        at: { type: Date, default: Date.now },
        actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        reason: { type: String, maxlength: 500, default: '' },
    }],
}, { timestamps: true });

kycSubmissionSchema.index({ userId: 1 }, { unique: true });
/** The review queue: oldest first within a status. */
kycSubmissionSchema.index({ status: 1, submittedAt: 1 });

export default mongoose.model('KycSubmission', kycSubmissionSchema);
