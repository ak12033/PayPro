import User from '../models/User.js';
import Session from '../models/Session.js';
import bcrypt from 'bcryptjs';
import { isValidEmail, validatePassword } from '../utils/validEmail.js';
import { emitToUser } from '../utils/socket.js';
import { asEmail, asString, asInt, escapeRegex } from '../utils/sanitize.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { closeAccount, exportUserData } from '../services/accountClosureService.js';
import { MUTABLE_CATEGORIES } from '../services/notificationPolicy.js';
import { balanceOf, balanceMinorOf } from '../utils/money.js';

const BCRYPT_ROUNDS = 12;

/**
 * Directory of users you can transfer money to.
 *
 * The previous implementation was `User.find().select('-password')` — it
 * returned **every remaining field of every user in the database** to any
 * authenticated caller: email addresses, exact account balances, last login
 * city/IP/ISP, notification preferences, and raw FCM device tokens. A single
 * GET /api/users/all dumped the entire customer base, and the FCM tokens in
 * particular would let a caller push arbitrary notifications to other users'
 * devices.
 *
 * It is now a paginated, searchable projection of the three fields the
 * recipient picker actually needs.
 *
 * A search term of at least 2 characters is now required to page past the
 * first screen (plan.md §4.9): the projection alone doesn't stop someone
 * from harvesting every name in the system by paging an empty search with no
 * rate limit worth mentioning. `directoryLimiter` (mounted on this route)
 * covers volume; this covers "volume achieved one page at a time forever".
 */
export const getAllUsers = asyncHandler(async (req, res) => {
    const limit = asInt(req.query.limit, { min: 1, max: 50, fallback: 25 });
    const search = asString(req.query.search, { maxLength: 60 });
    const hasSearch = Boolean(search) && search.length >= 2;
    const page = hasSearch
        ? asInt(req.query.page, { min: 1, max: 1000, fallback: 1 })
        : 1;

    // Never list the caller — you cannot transfer to yourself.
    const query = { _id: { $ne: req.user.id } };

    if (hasSearch) {
        const rx = new RegExp(escapeRegex(search), 'i');
        query.$or = [{ firstName: rx }, { lastName: rx }];
    }

    const [users, total] = await Promise.all([
        User.find(query)
            .select('firstName lastName')
            .sort({ firstName: 1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        User.countDocuments(query)
    ]);

    res.status(200).json({
        users,
        total,
        currentPage: page,
        totalPages: Math.max(1, Math.ceil(total / limit))
    });
});

export const getAccountBalance = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select('accountBalance balanceMinor');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.status(200).json({ balance: balanceOf(user), balanceMinor: balanceMinorOf(user) });
});

export const getUserProfile = asyncHandler(async (req, res) => {
    // password is select:false on the schema, so it cannot leak from here.
    const user = await User.findById(req.user.id)
        .select('-fcmTokens -failedLoginAttempts -lockUntil -tokenVersion')
        .lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    // The rupee figure is derived from the integer column (plan.md §7.4 step 3),
    // not the stored double, so it can never show accumulated float error.
    // `totp` here carries only enabled/enabledAt: the secret and the recovery
    // codes are select:false. `totpEnabled` matches the login response's shape.
    res.status(200).json({
        ...user,
        accountBalance: balanceOf(user),
        balanceMinor: balanceMinorOf(user),
        totpEnabled: Boolean(user.totp?.enabled),
    });
});

export const updateUserProfile = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select('+password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const firstName = asString(req.body?.firstName, { maxLength: 60 });
    const lastName = asString(req.body?.lastName, { maxLength: 60 });
    const email = req.body?.email !== undefined ? asEmail(req.body.email) : undefined;
    const password = typeof req.body?.password === 'string' && req.body.password
        ? req.body.password
        : null;
    const currentPassword = typeof req.body?.currentPassword === 'string'
        ? req.body.currentPassword
        : null;

    const changingEmail = email !== undefined && email !== null && email !== user.email;
    const changingPassword = Boolean(password);

    /**
     * Re-authentication for sensitive changes.
     *
     * Previously the password and the email address could both be rewritten
     * with nothing but a valid access token — so anyone who obtained a token
     * (XSS, a borrowed unlocked laptop, a leaked device) could silently take
     * over the account and lock the real owner out of a wallet holding money.
     * Both are now gated on the current password.
     */
    if (changingEmail || changingPassword) {
        if (!currentPassword) {
            return res.status(400).json({
                message: 'Your current password is required to change your email or password'
            });
        }
        const ok = await bcrypt.compare(currentPassword, user.password);
        if (!ok) {
            return res.status(401).json({ message: 'Current password is incorrect' });
        }
    }

    if (email !== undefined) {
        if (email === null || !isValidEmail(email)) {
            return res.status(400).json({ message: 'Invalid email format' });
        }
        if (changingEmail) {
            const existing = await User.findOne({ email }).select('_id').lean();
            if (existing) {
                return res.status(409).json({ message: 'Email already in use' });
            }
            user.email = email;
            // Proof of the old inbox says nothing about the new one.
            user.emailVerified = false;
            user.emailVerifiedAt = null;
        }
    }

    if (firstName) user.firstName = firstName;
    if (lastName !== null && lastName !== undefined) user.lastName = lastName;

    if (changingPassword) {
        const check = validatePassword(password);
        if (!check.ok) {
            return res.status(400).json({ message: check.error });
        }
        user.password = await bcrypt.hash(password, BCRYPT_ROUNDS);
        // Invalidate outstanding access tokens, so a password change actually
        // evicts an attacker who is already holding one.
        user.tokenVersion = (user.tokenVersion || 0) + 1;
    }

    try {
        await user.save();
    } catch (err) {
        if (err?.code === 11000) {
            return res.status(409).json({ message: 'Email already in use' });
        }
        throw err;
    }

    if (changingPassword) {
        await Session.deleteMany({ userId: user._id });
    }

    const payload = {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        accountBalance: balanceOf(user),
        balanceMinor: balanceMinorOf(user),
        lastLoginLocation: user.lastLoginLocation,
        preferences: user.preferences,
        emailVerified: Boolean(user.emailVerified),
    };

    emitToUser(user._id.toString(), 'profile_updated', { user: payload });

    res.json({
        message: changingPassword
            ? 'Profile updated. Please sign in again with your new password.'
            : 'Profile updated successfully',
        requiresReauth: changingPassword,
        user: payload,
    });
});

export const updateSettings = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Only booleans are accepted. A non-boolean previously passed straight into
    // the document — and `transaction2FA: "false"` is truthy, so a typo on the
    // client could silently disable a security control.
    const keys = ['twoFactorAuth', 'transaction2FA', 'emailAlerts', 'pushNotifications', 'budgetAlerts'];
    for (const key of keys) {
        if (typeof req.body?.[key] === 'boolean') {
            user.preferences[key] = req.body[key];
        }
    }

    // Same discipline for the nested preferences (plan.md §26.2.4–5): known
    // keys only, exact types only, anything else ignored rather than stored.
    const categories = req.body?.pushCategories;
    if (categories && typeof categories === 'object') {
        for (const category of MUTABLE_CATEGORIES) {
            if (typeof categories[category] === 'boolean') {
                user.set(`preferences.pushCategories.${category}`, categories[category]);
            }
        }
    }
    const quiet = req.body?.quietHours;
    if (quiet && typeof quiet === 'object') {
        if (typeof quiet.enabled === 'boolean') user.set('preferences.quietHours.enabled', quiet.enabled);
        for (const edge of ['start', 'end']) {
            if (Number.isInteger(quiet[edge]) && quiet[edge] >= 0 && quiet[edge] <= 23) {
                user.set(`preferences.quietHours.${edge}`, quiet[edge]);
            }
        }
    }

    await user.save();

    emitToUser(user._id.toString(), 'profile_updated', {
        user: {
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            accountBalance: balanceOf(user),
            balanceMinor: balanceMinorOf(user),
            lastLoginLocation: user.lastLoginLocation,
            preferences: user.preferences
        }
    });

    res.json({
        message: 'Settings updated successfully',
        preferences: user.preferences
    });
});

/**
 * Account closure (plan.md §40.2). Re-authentication required, matching
 * `updateUserProfile`'s pattern for every other irreversible-feeling account
 * change — a stolen access token alone must not be able to close an account.
 */
export const closeMyAccount = asyncHandler(async (req, res) => {
    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : null;
    if (!currentPassword) {
        return res.status(400).json({ message: 'Your current password is required to close your account' });
    }

    const user = await User.findById(req.user.id).select('+password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) return res.status(401).json({ message: 'Current password is incorrect' });

    await closeAccount(req.user.id, { reason: asString(req.body?.reason, { maxLength: 280 }) || undefined });

    res.status(200).json({ message: 'Your account has been closed.' });
});

/** A JSON export of the caller's own data (plan.md §40.2). */
export const exportMyData = asyncHandler(async (req, res) => {
    const bundle = await exportUserData(req.user.id);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="paypro-data-export-${new Date().toISOString().slice(0, 10)}.json"`);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(bundle);
});
