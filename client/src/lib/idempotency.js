/**
 * Idempotency key for money-moving requests.
 *
 * Without one, a double-clicked button or an axios retry after a network
 * timeout produced two genuine transfers. The server de-duplicates on this key,
 * so a repeat of the *same* attempt is a no-op while a deliberate second
 * transfer (new key) still goes through.
 *
 * `crypto.randomUUID` is unavailable on insecure origins, hence the fallback.
 */
export const createIdempotencyKey = () =>
    crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
