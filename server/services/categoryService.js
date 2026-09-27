import { CATEGORY_NAMES, CATEGORY_ICON_MAP, DEFAULT_CATEGORY, SYSTEM_CATEGORIES } from '../constants/categories.js';
import CategoryRule from '../models/CategoryRule.js';
import { normaliseMerchant } from '../utils/merchant.js';
import { audit } from './auditService.js';
import { AUDIT } from '../models/AuditLog.js';

/** Icon for a category name, falling back to the default money icon. */
export const iconFor = (category) => CATEGORY_ICON_MAP[category] || CATEGORY_ICON_MAP[DEFAULT_CATEGORY];

/** Whether `category` is one a user picked or an AI assigned. */
export const isUserCategory = (category) => CATEGORY_NAMES.includes(category);

/**
 * Whether a user may re-file a transaction under `category`.
 *
 * System categories (Transfer, Top Up, Refund, the legacy Stripe value) are
 * excluded: they describe *how* money moved, not what it was spent on, and
 * letting a P2P transfer be relabelled "Food" would silently corrupt both the
 * transfer-leg invariant and category-based analytics.
 */
export const canRecategorise = (currentCategory) => !SYSTEM_CATEGORIES.includes(currentCategory);

/**
 * Resolve a category coming out of AI categorisation: validated against the
 * canonical list so a model that drifts from its prompt (or an AI outage's
 * safe default) can never write a value the rest of the product doesn't know
 * about.
 */
export const resolveAiCategory = (rawCategory) => {
    const category = isUserCategory(rawCategory) ? rawCategory : DEFAULT_CATEGORY;
    return { category, icon: iconFor(category) };
};

/**
 * Standing user rules — slot 3 of plan.md §12.4's resolution order.
 *
 * Looked up *before* the AI is asked, not after: a rule that only applied when
 * the model happened to be wrong would still be paying for a model call and
 * still be racing it. If a rule matches, categorisation is settled and the
 * request never leaves the process.
 *
 * @returns {Promise<{category, icon, categorySource:'rule', ruleId}|null>}
 */
export const findMatchingRule = async (userId, description) => {
    const merchantKey = normaliseMerchant(description);
    if (!merchantKey) return null;

    const rule = await CategoryRule.findOne({ userId, merchantKey }).lean();
    if (!rule) return null;

    /**
     * A rule can outlive the category it names — the list is edited across
     * releases. A stale rule is ignored rather than written through, so an
     * unknown category name can never re-enter the database by this path.
     */
    if (!isUserCategory(rule.category)) return null;

    CategoryRule.updateOne(
        { _id: rule._id },
        { $inc: { appliedCount: 1 }, $set: { lastAppliedAt: new Date() } }
    ).catch(() => {});

    return {
        category: rule.category,
        icon: iconFor(rule.category),
        categorySource: 'rule',
        ruleId: rule._id,
    };
};

/**
 * "Always categorise <merchant> as <category>" (§12.4).
 *
 * Upsert rather than insert: a user correcting the same merchant a second time
 * is changing their mind, not creating a conflicting second rule.
 */
export const saveRule = async (userId, { description, category, req }) => {
    const merchantKey = normaliseMerchant(description);
    if (!merchantKey) return null;
    if (!isUserCategory(category) || SYSTEM_CATEGORIES.includes(category)) return null;

    const rule = await CategoryRule.findOneAndUpdate(
        { userId, merchantKey },
        {
            $set: { category, sampleDescription: String(description).slice(0, 280) },
            // A rule pointed at a new category has not applied to anything yet.
            $setOnInsert: { appliedCount: 0 },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    audit(AUDIT.CATEGORY_RULE_CREATED, {
        userId, req,
        target: { type: 'CategoryRule', id: String(rule._id) },
        metadata: { merchantKey, category },
    });

    return rule;
};

export const listRules = (userId) =>
    CategoryRule.find({ userId }).sort({ createdAt: -1 }).limit(200).lean();

export const deleteRule = async (userId, ruleId, { req } = {}) => {
    const rule = await CategoryRule.findOneAndDelete({ _id: ruleId, userId });
    if (!rule) return null;
    audit(AUDIT.CATEGORY_RULE_DELETED, {
        userId, req,
        target: { type: 'CategoryRule', id: String(ruleId) },
        metadata: { merchantKey: rule.merchantKey, category: rule.category },
    });
    return rule;
};

export default {
    iconFor, isUserCategory, canRecategorise, resolveAiCategory,
    findMatchingRule, saveRule, listRules, deleteRule,
};
