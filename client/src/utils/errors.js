/**
 * One place that knows how to turn an axios failure into user-facing copy.
 *
 * Every call site used to repeat `err.response?.data?.message || '...'`, so a
 * network failure (where `err.response` is undefined) showed the generic
 * fallback instead of telling the user their connection was the problem.
 */
export const getErrorMessage = (error, fallback = 'Something went wrong.') => {
    if (!error) return fallback;
    if (!error.response) {
        return "Can't reach the server. Check your connection and try again.";
    }
    return error.response?.data?.message || fallback;
};

export const getErrorStatus = (error) => error?.response?.status ?? null;

export const getErrorData = (error) => error?.response?.data ?? null;
