/**
 * Collapse a merchant string to a stable grouping key.
 *
 * Real descriptions carry per-charge noise — an order id, an invoice number,
 * the billing month — so the raw string groups nothing. Stripping digits is
 * blunt but right for this purpose: "Netflix 2847" and "Netflix 9931" are the
 * same merchant, and a merchant whose *name* is only digits is not a case worth
 * preserving at the cost of missing every real subscription.
 *
 * Lives in `utils/` rather than in either of its two callers because both
 * `recurringService` (grouping detections) and `categoryService` (matching a
 * standing CategoryRule) need exactly this key, and they must agree on it — a
 * rule saved against one spelling and a detection grouped under another would
 * quietly never match. Keeping it here also breaks what would otherwise be a
 * circular import between those two services, which now both depend on this
 * and on nothing of each other's.
 *
 * Returns '' when nothing groupable remains. Callers must treat that as "cannot
 * group", never as a key: grouping every unparseable description under one
 * empty string would merge unrelated merchants into a single fiction.
 */
export const normaliseMerchant = (raw) => String(raw || '')
    .toLowerCase()
    // Dates in any common separator, before digits are stripped wholesale.
    .replace(/\b\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}\b/g, ' ')
    // Reference/order/invoice/transaction ids and their label.
    .replace(/\b(ref|order|txn|inv|invoice|id|no)\b[:# ]*\w+/g, ' ')
    .replace(/\d+/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export default { normaliseMerchant };
