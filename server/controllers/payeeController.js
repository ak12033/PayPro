import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { asObjectId, asString } from '../utils/sanitize.js';
import { audit } from '../services/auditService.js';
import { AUDIT } from '../models/AuditLog.js';
import { listPayees, savePayee, updatePayee, removePayee, PayeeError } from '../services/payeeService.js';
import { issuePaymentCode, verifyPaymentCode } from '../services/paymentCodeService.js';

const handle = (res, err) => {
    if (err instanceof PayeeError) {
        res.status(err.status).json({ message: err.message });
        return true;
    }
    return false;
};

export const getPayees = asyncHandler(async (req, res) => {
    res.status(200).json({ payees: await listPayees(req.user.id) });
});

export const postPayee = asyncHandler(async (req, res) => {
    const payeeUserId = asObjectId(req.body?.payeeUserId);
    if (!payeeUserId) return res.status(400).json({ message: 'A valid person is required' });

    try {
        const payee = await savePayee(req.user.id, {
            payeeUserId,
            nickname: asString(req.body?.nickname, { maxLength: 40 }) || '',
            favourite: req.body?.favourite === true,
        });
        audit(AUDIT.PAYEE_SAVED, {
            userId: req.user.id, req,
            target: { type: 'Payee', id: String(payee._id) },
            metadata: { payeeUserId: String(payeeUserId) },
        });
        res.status(201).json({ payee });
    } catch (err) {
        if (!handle(res, err)) throw err;
    }
});

export const patchPayee = asyncHandler(async (req, res) => {
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'A valid payee id is required' });

    const payload = {};
    if (req.body?.nickname !== undefined) {
        payload.nickname = asString(req.body.nickname, { maxLength: 40 }) || '';
    }
    if (req.body?.favourite !== undefined) payload.favourite = req.body.favourite === true;

    if (!Object.keys(payload).length) return res.status(400).json({ message: 'Nothing to update' });

    try {
        res.status(200).json({ payee: await updatePayee(req.user.id, id, payload) });
    } catch (err) {
        if (!handle(res, err)) throw err;
    }
});

export const deletePayee = asyncHandler(async (req, res) => {
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'A valid payee id is required' });

    try {
        await removePayee(req.user.id, id);
        audit(AUDIT.PAYEE_REMOVED, { userId: req.user.id, req, target: { type: 'Payee', id: String(id) } });
        res.status(200).json({ message: 'Payee removed' });
    } catch (err) {
        if (!handle(res, err)) throw err;
    }
});

/**
 * The QR payload for "pay me" (plan.md §9.3).
 *
 * Short-lived and signed. Audited because a payment code is an identifier the
 * holder can hand to a stranger — an unusual number of codes issued for one
 * account is worth being able to see after the fact.
 */
export const getPaymentCode = asyncHandler(async (req, res) => {
    const { code, expiresAt, ttlSeconds } = issuePaymentCode(req.user.id);

    audit(AUDIT.PAYMENT_CODE_ISSUED, { userId: req.user.id, req });

    res.status(200).json({ code, expiresAt, ttlSeconds });
});

/**
 * Resolve a scanned code to a recipient.
 *
 * Returns only what the send screen needs to show who is about to be paid. It
 * authorises nothing: the sender still types an amount and confirms, and the
 * transfer runs the full limits/risk/2FA path like any other.
 */
export const postResolvePaymentCode = asyncHandler(async (req, res) => {
    const code = asString(req.body?.code, { maxLength: 512 });
    if (!code) return res.status(400).json({ message: 'A payment code is required' });

    const result = verifyPaymentCode(code);
    if (!result.ok) return res.status(400).json({ message: result.error });

    if (String(result.userId) === String(req.user.id)) {
        return res.status(400).json({ message: 'That is your own payment code' });
    }

    const user = await User.findById(result.userId).select('firstName lastName email status').lean();
    if (!user || user.status !== 'active') {
        return res.status(404).json({ message: 'That account is not available' });
    }

    res.status(200).json({
        recipient: {
            _id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
        },
    });
});
