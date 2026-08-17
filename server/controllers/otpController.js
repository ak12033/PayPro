import Otp from '../models/Otp.js';
import User from '../models/User.js';
import { createSession } from '../utils/token.js';
import { asEmail, asString, asObjectId } from '../utils/sanitize.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { executeTransfer, issueTransferChallenge } from './transactionController.js';
import { parseAmount } from '../utils/money.js';
import { publicUser } from './authController.js';
import {
    consumeChallenge,
    verifyLoginChallenge,
    reissueLoginChallenge,
} from '../services/twoFactorService.js';
import {
    describeRequestDevice,
    resolveChallengeDevice,
    finalizeLogin,
} from '../services/loginSecurityService.js';
import { audit } from '../services/auditService.js';
import { AUDIT } from '../models/AuditLog.js';

/**
 * Complete a login that required a second factor.
 *
 * Three things happen here that did not before: the challenge is checked
 * against the device it was issued to (see twoFactorService), the user can
 * choose to trust this device so the next sign-in is not interrupted, and the
 * device's location is updated — which is the step that makes "challenge once
 * after moving city, then stop asking" work.
 */
export const verifyLoginOtp = asyncHandler(async (req, res) => {
    const email = asEmail(req.body?.email);
    const otp = asString(req.body?.otp, { maxLength: 10 });
    const challengeId = asString(req.body?.challengeId, { maxLength: 64 });
    // Strict `=== true`: a truthy string from a mis-serialised form must not
    // silently grant a device permanent trust.
    const trustDevice = req.body?.trustDevice === true;

    if (!email || !otp) {
        return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const user = await User.findOne({ email });

    /**
     * An unknown address gets the same answer as an address with no pending
     * challenge. Anything else turns this unauthenticated route into an
     * account-existence oracle.
     */
    if (!user) {
        return res.status(400).json({
            message: 'No verification code found. Please request a new one.',
        });
    }

    // Computed before the code is checked: the challenge is bound to a device,
    // and that binding has to be verified before the code is consumed.
    const { context, prints } = describeRequestDevice({
        user,
        req,
        declaredDevice: req.body?.deviceInfo,
    });

    // purpose:'login' — a transfer code can no longer satisfy a login challenge.
    const result = await verifyLoginChallenge({ email, otp, challengeId, prints });
    if (result.message) {
        audit(AUDIT.LOGIN_2FA_REQUIRED, {
            userId: user._id, outcome: 'failure', req, metadata: { status: result.status },
        });
        return res.status(result.status).json({ message: result.message });
    }

    const challenge = result.context;

    const { device, location } = await resolveChallengeDevice({
        user,
        req,
        context,
        prints,
        deviceId: challenge.deviceId,
    });

    const accessToken = await createSession(user, req, res);

    await finalizeLogin({
        user,
        device,
        prints,
        context,
        location,
        trustDevice,
        loginHistoryId: challenge.loginHistoryId,
    });

    audit(AUDIT.LOGIN_2FA_VERIFIED, {
        userId: user._id,
        req,
        metadata: { city: location.city, trustDevice, reasons: challenge.reasons },
    });

    if (trustDevice) {
        audit(AUDIT.DEVICE_TRUSTED, {
            userId: user._id,
            req,
            target: { type: 'TrustedDevice', id: String(device?._id ?? '') },
            metadata: { device: context.deviceName, city: location.city },
        });
    }

    res.status(200).json({
        message: 'Login successful',
        accessToken,
        user: publicUser(user),
        deviceTrusted: trustDevice,
    });
});

export const resendLoginOtp = asyncHandler(async (req, res) => {
    const email = asEmail(req.body?.email);
    if (!email) return res.status(400).json({ message: 'Email is required' });

    /**
     * Always answer 200.
     *
     * Returning a different response for an unknown address turns this endpoint
     * into an account-existence oracle, and the route is unauthenticated by
     * necessity (the user is mid-login).
     *
     * The resend keeps the original challenge's context, so the new code stays
     * bound to the same device and the same challengeId. Minting a fresh
     * challenge here would let anyone who knows an email address re-point a
     * pending login at their own device.
     */
    await reissueLoginChallenge(email);

    res.status(200).json({ message: 'If the account exists, a verification code has been sent.' });
});

/**
 * Verify a transfer OTP **and execute the transfer it authorised**.
 *
 * The previous design split this into two calls:
 *
 *   1. POST /transactions/verify-otp  (no auth middleware at all)
 *   2. POST /transactions/transfer  { ...pendingTransfer, skip2FA: true }
 *
 * with the pending transfer held in the browser's localStorage. That had three
 * independent holes:
 *
 *   - step 2 never checked that step 1 had happened, and `skip2FA` was read
 *     straight from the request body, so the OTP could simply be skipped;
 *   - the amount and recipient came from localStorage, so a user could approve
 *     a small transfer by email and then edit the stored payload before step 2;
 *   - step 1 was unauthenticated and took an arbitrary email, so anyone could
 *     consume or brute-force another account's pending codes.
 *
 * Now the challenge itself carries the authorised recipient and amount, this
 * route is authenticated, and settlement happens here — there is no window
 * between verification and execution for the parameters to change.
 */
export const verifyTransferOtp = asyncHandler(async (req, res) => {
    const otp = asString(req.body?.otp, { maxLength: 10 });
    if (!otp) return res.status(400).json({ message: 'OTP is required' });

    const sender = await User.findById(req.user.id).select('firstName email accountBalance preferences');
    if (!sender) return res.status(404).json({ message: 'User not found' });

    // Bound to the authenticated user's own email — not one supplied in the body.
    const result = await consumeChallenge(sender.email, 'transfer', otp);
    if (result.message) {
        return res.status(result.status).json({ message: result.message });
    }

    const context = result.record.context || {};
    const recipientId = asObjectId(context.recipientId);
    const parsed = parseAmount(context.amount);

    if (!recipientId || !parsed.ok) {
        return res.status(400).json({ message: 'The pending transfer is no longer valid. Please start again.' });
    }
    const amount = parsed.value;

    const recipient = await User.findById(recipientId).select('firstName');
    if (!recipient) return res.status(404).json({ message: 'Recipient not found' });

    if (sender.accountBalance < amount) {
        return res.status(400).json({ message: 'Insufficient balance' });
    }

    const outcome = await executeTransfer({ sender, recipient, amount });
    if (outcome.error) {
        return res.status(outcome.status).json({ message: outcome.error });
    }

    res.status(200).json({
        message: 'Transfer completed successfully',
        senderTransactionId: outcome.senderTx._id,
        recipientTransactionId: outcome.recipientTx._id,
        balance: outcome.sender.accountBalance
    });
});

/**
 * Resend the transfer OTP for the *currently pending* challenge.
 *
 * Authenticated, and it re-uses the recipient/amount already bound to the open
 * challenge rather than accepting new ones. The old version took an arbitrary
 * email on an unauthenticated route, so it doubled as a free email-bombing
 * relay and could delete another user's pending login code.
 */
export const resendTransferOtp = asyncHandler(async (req, res) => {
    const sender = await User.findById(req.user.id).select('firstName email');
    if (!sender) return res.status(404).json({ message: 'User not found' });

    const pending = await Otp.findOne({ email: sender.email, purpose: 'transfer' }).sort({ createdAt: -1 });
    if (!pending) {
        return res.status(400).json({ message: 'No pending transfer to verify. Please start again.' });
    }

    const recipientId = asObjectId(pending.context?.recipientId);
    const parsed = parseAmount(pending.context?.amount);
    if (!recipientId || !parsed.ok) {
        return res.status(400).json({ message: 'The pending transfer is no longer valid. Please start again.' });
    }

    await issueTransferChallenge(sender, recipientId, parsed.value);

    res.status(200).json({ message: 'OTP resent successfully' });
});
