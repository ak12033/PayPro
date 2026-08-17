import crypto from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';

/**
 * Per-request correlation id.
 *
 * Logs previously had no way to tie together the lines produced by a single
 * request: with concurrent traffic, a morgan access line, a controller warning
 * and an error stack for the *same* failing transfer were interleaved with
 * dozens of unrelated entries and could not be grouped after the fact. That
 * makes any production incident involving money effectively un-debuggable.
 *
 * AsyncLocalStorage carries the id through async boundaries, so services deep
 * in the call stack can log with it without threading `req` everywhere.
 */
export const requestStore = new AsyncLocalStorage();

export const getRequestId = () => requestStore.getStore()?.requestId;
export const getRequestUserId = () => requestStore.getStore()?.userId;

export const requestContext = (req, res, next) => {
    // Honour an upstream id (from a load balancer or gateway) so a trace
    // spans the whole edge-to-service path, but never trust its shape.
    const inbound = req.headers['x-request-id'];
    const requestId = (typeof inbound === 'string' && /^[\w-]{1,64}$/.test(inbound))
        ? inbound
        : crypto.randomUUID();

    req.id = requestId;
    res.setHeader('X-Request-Id', requestId);

    // userId is filled in later by authMiddleware; the object is shared by
    // reference so the store sees the update.
    const store = { requestId, userId: null };
    req.context = store;

    requestStore.run(store, () => next());
};
