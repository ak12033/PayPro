/**
 * A populated user reference, as a readable name. Falls back to the email,
 * then to `fallback` — a closed account is pseudonymised server-side, and a
 * dangling reference must still render as *something* in a queue row.
 */
export const personName = (person, fallback = 'Unknown') =>
    person ? [person.firstName, person.lastName].filter(Boolean).join(' ') || person.email || fallback : fallback;

export default personName;
