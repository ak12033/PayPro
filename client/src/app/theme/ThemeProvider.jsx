import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';

const STORAGE_KEY = 'paypro-theme';

const ThemeContext = createContext(null);

/** 'system' is a real, persisted choice — not the absence of one. */
export const THEME_OPTIONS = ['light', 'dark', 'system'];

const readStoredPreference = () => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return THEME_OPTIONS.includes(stored) ? stored : 'system';
    } catch {
        // Private-mode Safari throws on localStorage access.
        return 'system';
    }
};

const systemPrefersDark = () =>
    window.matchMedia('(prefers-color-scheme: dark)').matches;

/**
 * Light/dark theming for the whole product.
 *
 * The provider writes `data-theme` onto <html>; every colour in the app is a
 * semantic CSS variable defined against that attribute, so nothing below has to
 * know which theme is active. No component should ever branch on the theme.
 */
export const ThemeProvider = ({ children }) => {
    const [preference, setPreference] = useState(readStoredPreference);
    const [systemIsDark, setSystemIsDark] = useState(systemPrefersDark);

    // Track the OS setting continuously, not just at mount: a user whose phone
    // switches to dark at sunset should see the app follow while it is open.
    useEffect(() => {
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const onChange = (event) => setSystemIsDark(event.matches);
        media.addEventListener('change', onChange);
        return () => media.removeEventListener('change', onChange);
    }, []);

    const resolved = preference === 'system'
        ? (systemIsDark ? 'dark' : 'light')
        : preference;

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', resolved);

        // Keeps the mobile browser chrome in step with the app surface;
        // without it the status bar stays white above a dark app.
        //
        // Read back off the canvas token rather than restated as a literal.
        // The attribute is set immediately above, so the computed value is
        // already the new theme's. Both literals that used to live here had
        // drifted from the ramp they were copied from.
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            const canvas = getComputedStyle(document.documentElement)
                .getPropertyValue('--color-canvas')
                .trim();
            if (canvas) meta.setAttribute('content', canvas);
        }
    }, [resolved]);

    const setTheme = useCallback((next) => {
        if (!THEME_OPTIONS.includes(next)) return;
        setPreference(next);
        try {
            localStorage.setItem(STORAGE_KEY, next);
        } catch {
            // Non-fatal: the theme still applies for this session.
        }
    }, []);

    const value = useMemo(
        () => ({ preference, theme: resolved, setTheme, isDark: resolved === 'dark' }),
        [preference, resolved, setTheme]
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};

export default ThemeProvider;
