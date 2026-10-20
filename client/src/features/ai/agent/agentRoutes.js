import { PUBLIC_ROUTES, ROUTES } from '../../../constants/routes';

/**
 * The client's own check on a route the agent asks it to open (plan.md §43.2).
 *
 * The server already restricts routes to its allowlist; this is the second
 * check, against the routes this bundle actually has. Signed-out pages, the
 * operations console, the 2FA flow and the catch-all are never targets.
 */
const NEVER = new Set([...PUBLIC_ROUTES, ROUTES.NOT_FOUND, ROUTES.TRANSFER_2FA]);

const AGENT_ROUTES = new Set(
    Object.values(ROUTES).filter((path) => !NEVER.has(path) && !path.startsWith(ROUTES.ADMIN))
);

/** A plain query only (`amount=500`): no fragments, no encoded tricks beyond `%`. */
const SAFE_QUERY = /^[A-Za-z0-9_.%=&-]{1,200}$/;

/** The route to navigate to, or null when it is not one the agent may open. */
export const allowedRoute = (route) => {
    if (typeof route !== 'string') return null;
    const [path, query] = route.split('#')[0].split('?', 2);
    if (!AGENT_ROUTES.has(path)) return null;
    if (query === undefined || query === '') return path;
    return SAFE_QUERY.test(query) ? `${path}?${query}` : path;
};

export default allowedRoute;
