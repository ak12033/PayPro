/**
 * Device attributes for login security.
 *
 * The server recognises returning devices so it can stop asking a trusted
 * laptop for an emailed code every time it signs in. This collects the small,
 * stable set of properties it uses to do that.
 *
 * What is deliberately *not* here:
 *
 *   - Location. No geolocation prompt, no IP lookup, no timezone-as-location.
 *     The server derives the approximate city from the connecting address
 *     itself, because anything the browser reports about where it is can be
 *     rewritten by whoever controls the browser — which is exactly the person
 *     the check is meant to catch. An earlier version of this app called an
 *     external IP service before every login and posted the result; the server
 *     ignored it, and it could not have trusted it if it hadn't.
 *
 *   - Canvas, WebGL and audio fingerprinting. The tracking-grade signals. They
 *     would add entropy, and they are also what makes fingerprinting a privacy
 *     problem rather than a security feature. Everything below is either
 *     already in the request headers or trivially visible to any site.
 *
 * The values are sent as-is and hashed server-side with a key that never leaves
 * the server, so what is stored cannot be reversed into a hardware profile.
 */

const safe = (read, fallback = null) => {
    try {
        const value = read();
        return value === undefined ? fallback : value;
    } catch {
        // Privacy modes, locked-down embedded webviews and older browsers throw
        // on some of these. A missing attribute is fine — the fingerprint is
        // just coarser, and the server falls back to the user agent.
        return fallback;
    }
};

export const getDeviceInfo = () => {
    if (typeof window === 'undefined') return {};

    return {
        platform: safe(() => navigator.userAgentData?.platform || navigator.platform),
        /**
         * Physical screen, not window size. Resizing a window is constant;
         * changing monitors is not — and the server treats a change here as
         * ordinary drift rather than a new device for exactly that reason.
         */
        screenResolution: safe(() => `${window.screen.width}x${window.screen.height}`),
        colorDepth: safe(() => window.screen.colorDepth),
        timezone: safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
        language: safe(() => navigator.language),
        hardwareConcurrency: safe(() => navigator.hardwareConcurrency),
        deviceMemory: safe(() => navigator.deviceMemory),
        touchSupport: safe(() => navigator.maxTouchPoints > 0 || 'ontouchstart' in window, false),
    };
};

export default getDeviceInfo;
