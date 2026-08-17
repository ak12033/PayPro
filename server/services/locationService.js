import getLocation from '../utils/getLocation.js';
import securityConfig from '../config/security.js';

/**
 * Everything geographic.
 *
 * Resolves an IP to an approximate place, compares two places, and answers
 * whether getting from one to the other in the time available was physically
 * possible. It holds no opinion about risk — it reports distance and lets the
 * risk engine decide what that is worth.
 */

/** Comparison tiers, worst last. Exported so callers can order them. */
export const PROXIMITY = {
    UNKNOWN: 'unknown',
    SAME: 'same',
    NEARBY: 'nearby',
    DIFFERENT_CITY: 'different_city',
    DIFFERENT_STATE: 'different_state',
    DIFFERENT_COUNTRY: 'different_country',
};

const SEVERITY = {
    [PROXIMITY.SAME]: 0,
    [PROXIMITY.NEARBY]: 1,
    [PROXIMITY.UNKNOWN]: 2,
    [PROXIMITY.DIFFERENT_CITY]: 3,
    [PROXIMITY.DIFFERENT_STATE]: 4,
    [PROXIMITY.DIFFERENT_COUNTRY]: 5,
};

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees) => (degrees * Math.PI) / 180;

const hasCoordinates = (place) =>
    Boolean(place) &&
    Number.isFinite(place.latitude) &&
    Number.isFinite(place.longitude);

const sameText = (a, b) =>
    Boolean(a) && Boolean(b) && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

/** Great-circle distance in km, or null when either side lacks coordinates. */
export const distanceKm = (from, to) => {
    if (!hasCoordinates(from) || !hasCoordinates(to)) return null;

    const dLat = toRadians(to.latitude - from.latitude);
    const dLon = toRadians(to.longitude - from.longitude);
    const lat1 = toRadians(from.latitude);
    const lat2 = toRadians(to.latitude);

    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
};

/** Resolve the caller's approximate location from their IP. */
export const resolveLocation = async (ip) => {
    const raw = await getLocation(ip);
    return { ...raw, suspectedProxy: isSuspectedProxy(raw.isp) };
};

/**
 * Hosting-provider / VPN heuristic.
 *
 * Exposed separately so it can be swapped for a commercial reputation feed
 * without touching anything that calls it.
 */
export const isSuspectedProxy = (isp) => {
    if (!isp) return false;
    const value = String(isp).toLowerCase();
    return securityConfig.network.proxyKeywords.some((keyword) => value.includes(keyword));
};

/**
 * Classify how far apart two places are.
 *
 * Coordinates are preferred; names are the fallback when a provider returns a
 * city but no coordinates. Distance wins over administrative boundaries because
 * boundaries are a poor proxy for "did this person move" — Noida and Delhi are
 * different states and twenty kilometres apart.
 */
export const compareLocations = (from, to) => {
    if (!from || !to) return { proximity: PROXIMITY.UNKNOWN, distanceKm: null };

    const { sameRadiusKm, nearbyRadiusKm } = securityConfig.location;
    const km = distanceKm(from, to);

    if (km !== null) {
        if (km <= sameRadiusKm) return { proximity: PROXIMITY.SAME, distanceKm: km };
        if (km <= nearbyRadiusKm) return { proximity: PROXIMITY.NEARBY, distanceKm: km };
        if (!sameText(from.country, to.country)) {
            return { proximity: PROXIMITY.DIFFERENT_COUNTRY, distanceKm: km };
        }
        if (!sameText(from.region ?? from.state, to.region ?? to.state)) {
            return { proximity: PROXIMITY.DIFFERENT_STATE, distanceKm: km };
        }
        return { proximity: PROXIMITY.DIFFERENT_CITY, distanceKm: km };
    }

    // No coordinates: fall back to names, and stay honest about the uncertainty.
    const fromCity = from.city;
    const toCity = to.city;
    const known = (value) => Boolean(value) && value !== 'Unknown';

    if (!known(fromCity) && !known(from.country)) return { proximity: PROXIMITY.UNKNOWN, distanceKm: null };
    if (!known(toCity) && !known(to.country)) return { proximity: PROXIMITY.UNKNOWN, distanceKm: null };

    if (from.country && to.country && !sameText(from.country, to.country)) {
        return { proximity: PROXIMITY.DIFFERENT_COUNTRY, distanceKm: null };
    }
    if (known(fromCity) && known(toCity) && sameText(fromCity, toCity)) {
        return { proximity: PROXIMITY.SAME, distanceKm: null };
    }
    const fromState = from.region ?? from.state;
    const toState = to.region ?? to.state;
    if (fromState && toState && !sameText(fromState, toState)) {
        return { proximity: PROXIMITY.DIFFERENT_STATE, distanceKm: null };
    }
    if (known(fromCity) && known(toCity)) {
        return { proximity: PROXIMITY.DIFFERENT_CITY, distanceKm: null };
    }
    return { proximity: PROXIMITY.UNKNOWN, distanceKm: null };
};

/** True when `proximity` is at least as severe as `floor`. */
export const isAtLeast = (proximity, floor) => SEVERITY[proximity] >= SEVERITY[floor];

/**
 * Pick the friendliest comparison against a set of known places.
 *
 * A user with a laptop in Delhi and a phone in Mumbai has two home locations,
 * not one. Signing in from either should read as familiar, so the *closest*
 * known place is the one that counts.
 */
export const compareAgainstKnown = (current, knownPlaces = []) => {
    let best = { proximity: PROXIMITY.UNKNOWN, distanceKm: null, place: null };

    for (const place of knownPlaces) {
        const result = compareLocations(place, current);
        if (result.proximity === PROXIMITY.UNKNOWN) continue;
        if (best.place === null || SEVERITY[result.proximity] < SEVERITY[best.proximity]) {
            best = { ...result, place };
        }
        if (best.proximity === PROXIMITY.SAME) break;
    }

    return best;
};

/**
 * Impossible travel.
 *
 * Two sign-ins far apart in space and close together in time mean one of them
 * was not the account holder. The floors on distance and elapsed time matter as
 * much as the speed limit: IP geolocation routinely moves a stationary user
 * between neighbouring city centroids, and without a distance floor that reads
 * as teleportation every time.
 */
export const detectImpossibleTravel = (previous, current, { previousAt, currentAt = new Date() } = {}) => {
    const none = { detected: false, distanceKm: null, hours: null, speedKmph: null };

    if (!previous || !current || !previousAt) return none;

    const km = distanceKm(previous, current);
    if (km === null) return none;

    const { maxSpeedKmph, minDistanceKm, minElapsedMinutes } = securityConfig.impossibleTravel;
    if (km < minDistanceKm) return { ...none, distanceKm: km };

    const elapsedMs = new Date(currentAt).getTime() - new Date(previousAt).getTime();
    // A clock skew or an out-of-order record must not be read as instant travel.
    if (elapsedMs < 0) return { ...none, distanceKm: km };

    const hours = Math.max(elapsedMs / 3600000, minElapsedMinutes / 60);
    const speedKmph = km / hours;

    return {
        detected: speedKmph > maxSpeedKmph,
        distanceKm: km,
        hours,
        speedKmph,
    };
};

/** Compact, storable shape. Used for both device and history rows. */
export const toStoredPlace = (location = {}) => ({
    ip: location.ip ?? null,
    city: location.city ?? null,
    state: location.region ?? location.state ?? null,
    country: location.country ?? null,
    latitude: Number.isFinite(location.latitude) ? location.latitude : null,
    longitude: Number.isFinite(location.longitude) ? location.longitude : null,
});

/** "Mumbai, Maharashtra, India" — for notifications and the device list. */
export const describePlace = (location = {}) => {
    const parts = [location.city, location.region ?? location.state, location.country]
        .filter((part) => part && part !== 'Unknown');
    return parts.length ? parts.join(', ') : 'an unknown location';
};

export default {
    resolveLocation,
    compareLocations,
    compareAgainstKnown,
    detectImpossibleTravel,
    distanceKm,
    describePlace,
    toStoredPlace,
    PROXIMITY,
};
