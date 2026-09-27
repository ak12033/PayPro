import RiskCase from '../models/RiskCase.js';
import User from '../models/User.js';
import { notifyUser } from './notificationService.js';
import { audit } from './auditService.js';
import { AUDIT } from '../models/AuditLog.js';
import logger from '../utils/logger.js';

/**
 * The review queue behind `transactionRiskService` (plan.md §30.2.3).
 *
 * Approving a case does **not** settle the transfer here. That is deliberate:
 * re-executing a held transfer hours later would re-run against a balance, a
 * recipient and a limit picture that have all moved on, and a "release" that
 * silently debits an account the user has since spent down is worse than
 * asking them to send it again. Approval clears the block and tells the user to
 * retry; the retry goes through the same gate, which will now see an approved
 * history for that recipient.
 */

export class RiskCaseError extends Error {
    constructor(code, message, status = 400) {
        super(message);
        this.name = 'RiskCaseError';
        this.code = code;
        this.status = status;
    }
}

export const listCases = async ({ status = 'open', limit = 50, page = 1 } = {}) => {
    const query = status === 'all' ? {} : { status };
    const [cases, total] = await Promise.all([
        RiskCase.find(query)
            // Urgent first, then oldest — a queue should surface the thing that
            // has been waiting longest, not the newest arrival.
            .sort({ priority: -1, createdAt: 1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('userId', 'firstName lastName email')
            .lean(),
        RiskCase.countDocuments(query),
    ]);
    return { cases, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) };
};

export const listUserCases = (userId) =>
    RiskCase.find({ userId }).sort({ createdAt: -1 }).limit(50).lean();

export const getCase = async (caseId) => {
    const riskCase = await RiskCase.findById(caseId)
        .populate('userId', 'firstName lastName email')
        .populate('reviewedBy', 'firstName lastName email')
        .populate('escalation.by', 'firstName lastName email')
        .lean();
    if (!riskCase) throw new RiskCaseError('NOT_FOUND', 'Risk case not found', 404);
    return riskCase;
};

/**
 * Resolve a case one way or the other.
 *
 * The status filter in the update is what makes this safe against two reviewers
 * acting at once: the second one's update matches nothing and gets a clear
 * 409 rather than silently overwriting the first decision.
 */
export const reviewCase = async ({ caseId, reviewerId, reviewerRole = 'admin', decision, notes = '', req }) => {
    if (!['approved', 'rejected'].includes(decision)) {
        throw new RiskCaseError('INVALID_DECISION', 'Decision must be approved or rejected', 400);
    }

    // An escalated case is an admin's to decide. Part of the update filter, not
    // a prior read, so an escalation landing mid-review is still honoured.
    const filter = { _id: caseId, status: 'open' };
    if (reviewerRole !== 'admin') filter['escalation.at'] = null;

    const riskCase = await RiskCase.findOneAndUpdate(
        filter,
        {
            $set: {
                status: decision,
                reviewedBy: reviewerId,
                reviewedAt: new Date(),
                notes,
            },
        },
        { new: true }
    );

    if (!riskCase) {
        const existing = await RiskCase.findById(caseId).select('status escalation').lean();
        if (!existing) throw new RiskCaseError('NOT_FOUND', 'Risk case not found', 404);
        if (existing.status === 'open' && existing.escalation?.at) {
            throw new RiskCaseError('ESCALATED', 'This case was escalated and needs an admin to decide it', 403);
        }
        throw new RiskCaseError('ALREADY_REVIEWED', 'This case has already been reviewed', 409);
    }

    audit(decision === 'approved' ? AUDIT.RISK_CASE_APPROVED : AUDIT.RISK_CASE_REJECTED, {
        userId: reviewerId,
        req,
        target: { type: 'RiskCase', id: String(riskCase._id) },
        metadata: {
            subjectUserId: String(riskCase.userId),
            score: riskCase.score,
            amount: riskCase.intent?.amount,
            notes,
        },
    });

    await notifyUser(
        riskCase.userId,
        'Security',
        decision === 'approved' ? 'Transfer review cleared' : 'Transfer was not approved',
        decision === 'approved'
            ? `We've finished reviewing your ₹${riskCase.intent?.amount} transfer. You can send it again — no money moved while it was held.`
            : `We couldn't approve your ₹${riskCase.intent?.amount} transfer. No money moved. Contact support if you think this is wrong.`,
        { riskCaseId: String(riskCase._id) }
    ).catch((err) => logger.error('Risk case notification failed', { error: err.message }));

    return riskCase;
};

/** How much longer an escalated hold waits before the clock releases it. */
export const ESCALATION_EXTENSION_MS = 24 * 60 * 60 * 1000;

/**
 * Hand an open case up to an admin (plan.md §28.2).
 *
 * Marks it urgent, restricts the decision to admins (`reviewCase`), and
 * moves a hold's auto-release deadline to 24h from now so it is not released
 * by the clock while it waits for the person it was escalated to. Only once:
 * the `escalation.at: null` filter refuses a second escalation, so the deadline
 * can be pushed out one time and the §30.2.3 promise ("an unstaffed queue must
 * not strand a user's money") still holds. Admins are notified.
 */
export const escalateCase = async ({ caseId, actorId, actorRole, reason, req, now = new Date() }) => {
    const existing = await RiskCase.findById(caseId).select('status action escalation autoReleaseAt').lean();
    if (!existing) throw new RiskCaseError('NOT_FOUND', 'Risk case not found', 404);
    if (existing.status !== 'open') throw new RiskCaseError('ALREADY_REVIEWED', 'This case has already been reviewed', 409);
    if (existing.escalation?.at) throw new RiskCaseError('ALREADY_ESCALATED', 'This case has already been escalated', 409);
    if (actorRole === 'admin') {
        throw new RiskCaseError('ADMIN_CANNOT_ESCALATE', 'Admins decide escalated cases; there is no one further to escalate to', 400);
    }

    const set = {
        priority: 'urgent',
        'escalation.at': now,
        'escalation.by': actorId,
        'escalation.reason': reason,
    };
    if (existing.action === 'hold') {
        set.autoReleaseAt = new Date(Math.max(
            existing.autoReleaseAt ? new Date(existing.autoReleaseAt).getTime() : 0,
            now.getTime() + ESCALATION_EXTENSION_MS,
        ));
    }

    const riskCase = await RiskCase.findOneAndUpdate(
        { _id: caseId, status: 'open', 'escalation.at': null },
        { $set: set },
        { new: true }
    );
    if (!riskCase) throw new RiskCaseError('ALREADY_ESCALATED', 'This case was reviewed or escalated by someone else', 409);

    audit(AUDIT.RISK_CASE_ESCALATED, {
        userId: actorId,
        req,
        target: { type: 'RiskCase', id: String(riskCase._id) },
        metadata: {
            subjectUserId: String(riskCase.userId),
            reason,
            autoReleaseAt: riskCase.autoReleaseAt,
        },
    });

    const admins = await User.find({ role: 'admin', status: 'active' }).select('_id').lean();
    await Promise.allSettled(admins.map((admin) => notifyUser(
        admin._id, 'System', 'Risk case escalated to you',
        `A held transfer needs an admin decision: ${reason}`,
        { riskCaseId: String(riskCase._id) },
        { dedupeKey: `risk-escalated:${riskCase._id}` }
    )));

    return riskCase;
};

/**
 * Release every hold whose deadline has passed (plan.md §30.2.3).
 *
 * "Auto-release after 24h if unreviewed, with an audit entry — an unstaffed
 * queue must not strand a user's money silently." Blocks are excluded by
 * construction: they carry no `autoReleaseAt`.
 */
export const autoReleaseExpired = async ({ now = new Date() } = {}) => {
    const expired = await RiskCase.find({
        status: 'open',
        action: 'hold',
        autoReleaseAt: { $ne: null, $lte: now },
    }).limit(500).lean();

    let released = 0;
    for (const riskCase of expired) {
        const updated = await RiskCase.findOneAndUpdate(
            { _id: riskCase._id, status: 'open' },
            { $set: { status: 'auto_released', reviewedAt: now, notes: 'Auto-released: not reviewed before the deadline.' } },
            { new: true }
        );
        // Lost the race to a human reviewer. Their decision wins.
        if (!updated) continue;

        audit(AUDIT.RISK_CASE_AUTO_RELEASED, {
            userId: riskCase.userId,
            target: { type: 'RiskCase', id: String(riskCase._id) },
            metadata: {
                score: riskCase.score,
                amount: riskCase.intent?.amount,
                heldForHours: Math.round((now - new Date(riskCase.createdAt)) / 3600000),
                rules: riskCase.rules?.map((r) => r.code),
            },
        });

        await notifyUser(
            riskCase.userId,
            'Security',
            'Transfer review finished',
            `Your ₹${riskCase.intent?.amount} transfer is no longer on hold. You can send it again — no money moved while it was held.`,
            { riskCaseId: String(riskCase._id) }
        ).catch(() => {});

        released += 1;
    }

    /**
     * An auto-release is a symptom, not a routine event: it means a case sat in
     * the queue past its deadline with nobody looking. Tell the people whose job
     * that is, once per sweep.
     */
    if (released > 0) {
        logger.error('Risk cases auto-released without review', { released });
        const reviewers = await User.find({ role: { $in: ['admin', 'risk'] }, status: 'active' })
            .select('_id').lean();
        const dayKey = now.toISOString().slice(0, 10);
        await Promise.allSettled(reviewers.map((reviewer) => notifyUser(
            reviewer._id, 'System', 'Risk cases auto-released',
            `${released} held transfer(s) passed their review deadline and were released automatically.`,
            { released },
            { dedupeKey: `risk-auto-release:${dayKey}` }
        )));
    }

    return { released, considered: expired.length };
};

export default { listCases, listUserCases, getCase, reviewCase, escalateCase, autoReleaseExpired, RiskCaseError };
