/**
 * Minimal className joiner.
 *
 * Kept dependency-free on purpose — the UI primitives only need falsy-filtering,
 * not full Tailwind conflict resolution.
 */
export const cn = (...classes) => classes.filter(Boolean).join(' ');

export default cn;
