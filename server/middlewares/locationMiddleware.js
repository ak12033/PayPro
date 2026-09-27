import { resolveLocation } from '../services/locationService.js';
import logger from '../utils/logger.js';

const UNKNOWN = {
    ip: 'Unknown',
    city: 'Unknown',
    region: null,
    country: null,
    countryCode: null,
    latitude: null,
    longitude: null,
    isp: 'Unknown ISP',
    suspectedProxy: false,
    resolved: false,
};

/**
 * Resolves the caller's approximate location for the login risk engine.
 *
 * The original read `req.headers['x-forwarded-for']` directly. That header is
 * fully client-controlled: anyone could send `X-Forwarded-For: <victim's IP>`
 * and make the server believe the login came from a familiar location,
 * defeating the location checks entirely.
 *
 * `req.ip` is the correct source — with `app.set('trust proxy', 1)` in
 * server.js, Express takes the last hop the trusted proxy actually observed and
 * ignores any values the client tried to prepend.
 *
 * A failure here degrades to "location unknown" rather than blocking the login.
 * The risk engine treats that as neither familiar nor suspicious, so the device
 * signals decide on their own.
 */
const locationMiddleware = async (req, res, next) => {
    try {
        req.currentLocation = (await resolveLocation(req.ip)) || UNKNOWN;
    } catch (error) {
        logger.error('Location middleware error', { error: error.message });
        req.currentLocation = UNKNOWN;
    }
    next();
};

export default locationMiddleware;
