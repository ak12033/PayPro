/**
 * Wraps an async route handler so a rejected promise reaches Express's error
 * middleware instead of becoming an unhandled rejection that silently hangs the
 * request until the client times out.
 */
export const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

export default asyncHandler;
