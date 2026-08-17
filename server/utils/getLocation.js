import axios from 'axios';

/**
 * Server-side IP geolocation.
 *
 * The only source of location in this application. Nothing here reads a
 * coordinate, a city or a time zone from the client: a login check that trusts
 * client-supplied location is not a check at all, because the attacker simply
 * claims the victim's home city.
 *
 * Resolution is city-level by design. Precise GPS is never requested, never
 * received and never stored.
 */

const FALLBACK = (ip) => ({
    ip: ip || 'Unknown',
    city: 'Unknown',
    region: null,
    country: null,
    countryCode: null,
    latitude: null,
    longitude: null,
    isp: 'Unknown ISP',
    resolved: false,
});

/**
 * Loopback and private ranges never resolve to anything useful, and a developer
 * running locally still needs a plausible location for the risk engine to work
 * against. Coordinates are included so distance maths behaves the same in
 * development as in production.
 */
const LOCAL = (ip) => ({
    ip: ip || '127.0.0.1',
    city: 'New Delhi',
    region: 'Delhi',
    country: 'India',
    countryCode: 'IN',
    latitude: 28.6139,
    longitude: 77.209,
    isp: 'Local ISP',
    resolved: true,
});

const isPrivateAddress = (ip) => {
    if (!ip) return true;
    const bare = ip.replace(/^::ffff:/, '');
    return (
        bare === '::1' ||
        bare === '127.0.0.1' ||
        /^10\./.test(bare) ||
        /^192\.168\./.test(bare) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(bare) ||
        /^169\.254\./.test(bare) ||
        /^f[cd]/i.test(bare) // fc00::/7 unique-local IPv6
    );
};

/**
 * Small in-process cache.
 *
 * ipapi.co was previously called on the critical path of every login and signup
 * with no cache and no timeout — so a slow third party directly slowed, or
 * indefinitely hung, authentication for every user.
 */
const cache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 1000;

const getLocation = async (ip) => {
    if (isPrivateAddress(ip)) return LOCAL(ip);

    const cached = cache.get(ip);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        return cached.value;
    }

    try {
        // Hard timeout: an unbounded request here blocked login indefinitely.
        const res = await axios.get(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
            timeout: 2500,
            headers: { 'User-Agent': 'PayPro/1.0' },
        });

        const data = res.data;
        const value = data && !data.error
            ? {
                ip,
                city: data.city || 'Unknown',
                region: data.region || null,
                country: data.country_name || null,
                countryCode: data.country_code || null,
                latitude: Number.isFinite(data.latitude) ? data.latitude : null,
                longitude: Number.isFinite(data.longitude) ? data.longitude : null,
                // `org` is the ASN description; it is what the proxy heuristic reads.
                isp: data.org || 'Unknown ISP',
                resolved: true,
            }
            : FALLBACK(ip);

        if (cache.size >= CACHE_MAX) {
            cache.delete(cache.keys().next().value); // FIFO eviction
        }
        cache.set(ip, { at: Date.now(), value });

        return value;
    } catch (error) {
        /**
         * A geolocation outage must never block a login. It degrades to
         * "location unknown", which the risk engine treats as *neither* a
         * familiar place nor a suspicious one — it simply stops contributing a
         * location signal, leaving the device signals to decide.
         */
        console.error('IP location lookup failed:', error.message);
        return FALLBACK(ip);
    }
};

export default getLocation;
