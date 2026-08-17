import mongoose from 'mongoose';

/**
 * Input coercion helpers.
 *
 * Express + Mongoose will happily accept `{"email": {"$ne": null}}` from a JSON
 * body and turn it into an operator inside a query. Every value that reaches a
 * query filter must therefore be forced to a primitive first.
 */

/** Force a value to a trimmed string, or null if it isn't string-like. */
export const asString = (value, { maxLength = 512 } = {}) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > maxLength) return null;
    return trimmed;
};

/** Normalise an email for storage/lookup. Returns null when not a valid string. */
export const asEmail = (value) => {
    const s = asString(value, { maxLength: 254 });
    return s ? s.toLowerCase() : null;
};

/** Validate an ObjectId coming from user input. */
export const asObjectId = (value) => {
    if (typeof value !== 'string') return null;
    if (!mongoose.Types.ObjectId.isValid(value)) return null;
    // isValid() also accepts any 12-char string; require the canonical 24-hex form.
    if (!/^[0-9a-fA-F]{24}$/.test(value)) return null;
    return value;
};

/** Bounded integer parser for pagination and similar knobs. */
export const asInt = (value, { min, max, fallback }) => {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n)) return fallback;
    if (n < min) return min;
    if (n > max) return max;
    return n;
};

/**
 * Escape a user supplied string before embedding it in a RegExp.
 * Without this, a search term like `(a+)+$` is a ReDoS vector and `.*` leaks
 * every row the filter was meant to narrow.
 */
export const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Allow-list helper: returns value only when it is one of `allowed`. */
export const asEnum = (value, allowed, fallback = undefined) =>
    (typeof value === 'string' && allowed.includes(value)) ? value : fallback;
