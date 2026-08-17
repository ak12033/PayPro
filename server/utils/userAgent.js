/**
 * Minimal user-agent parsing.
 *
 * Deliberately extracts *families* only — "Chrome", "Windows" — and throws the
 * version numbers away. That is not laziness: version numbers are the single
 * most volatile part of a user agent, and a fingerprint that includes them
 * breaks every time Chrome ships (roughly every four weeks) or the OS installs
 * an update. Users would be challenged on a schedule set by their vendor's
 * release cadence, which trains them to approve prompts without reading them.
 *
 * No dependency, because the alternative libraries carry megabytes of regexes
 * to answer questions this system never asks.
 */

const BROWSERS = [
    // Order matters: every Chromium browser also claims "Chrome", and Edge and
    // Opera both claim "Safari" as well. The most specific token wins.
    [/edg(?:e|a|ios)?\//i, 'Edge'],
    [/opr\/|opera/i, 'Opera'],
    [/samsungbrowser/i, 'Samsung Internet'],
    [/ucbrowser/i, 'UC Browser'],
    [/firefox\/|fxios/i, 'Firefox'],
    [/chrome\/|crios/i, 'Chrome'],
    [/safari\//i, 'Safari'],
    [/msie |trident\//i, 'Internet Explorer'],
];

const OPERATING_SYSTEMS = [
    // Android must be tested before Linux — every Android UA contains "Linux".
    [/windows nt/i, 'Windows'],
    [/android/i, 'Android'],
    [/iphone|ipad|ipod|ios/i, 'iOS'],
    [/mac os x|macintosh/i, 'macOS'],
    [/cros/i, 'ChromeOS'],
    [/linux|x11/i, 'Linux'],
];

const match = (userAgent, table) => {
    for (const [pattern, label] of table) {
        if (pattern.test(userAgent)) return label;
    }
    return 'Unknown';
};

/** 'mobile' | 'tablet' | 'desktop' | 'unknown' */
export const parseDeviceType = (userAgent) => {
    if (!userAgent) return 'unknown';
    if (/ipad|tablet|playbook|silk/i.test(userAgent)) return 'tablet';
    // Android phones say "Mobile"; Android tablets omit it.
    if (/mobi|iphone|ipod|android.*mobile|windows phone/i.test(userAgent)) return 'mobile';
    if (/android/i.test(userAgent)) return 'tablet';
    if (/windows|macintosh|linux|cros|x11/i.test(userAgent)) return 'desktop';
    return 'unknown';
};

export const parseUserAgent = (rawUserAgent) => {
    const userAgent = typeof rawUserAgent === 'string' ? rawUserAgent.slice(0, 512) : '';

    return {
        userAgent,
        browser: match(userAgent, BROWSERS),
        os: match(userAgent, OPERATING_SYSTEMS),
        deviceType: parseDeviceType(userAgent),
    };
};

/** "Chrome on Windows" — the label shown in the device list. */
export const describeDevice = ({ browser, os, deviceType }) => {
    if (browser === 'Unknown' && os === 'Unknown') {
        return deviceType && deviceType !== 'unknown' ? `Unknown ${deviceType}` : 'Unknown device';
    }
    if (browser === 'Unknown') return `${os} device`;
    if (os === 'Unknown') return browser;
    return `${browser} on ${os}`;
};

export default parseUserAgent;
