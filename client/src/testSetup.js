import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Testing Library's own auto-cleanup only registers itself when it can see a
 * global `afterEach` (Jest provides one; vitest only does with
 * `test.globals: true`, which this config deliberately leaves off so test
 * files say `import { it } from 'vitest'` explicitly). Without this, a
 * component rendered in one test is still in the document for the next one
 * in the same file, and a `getByText` that matched a single node now matches
 * two.
 */
afterEach(cleanup);

/**
 * jsdom has no `window.matchMedia`, and the theme and the decorative
 * canvases call it on mount to decide whether to animate. Answering "no" to
 * every query is the conservative environment: no hover, no reduced-motion
 * preference, light scheme — so a component renders its plain, static form.
 * Before any test rendered a primary Button this gap was never hit.
 */
if (typeof window !== 'undefined' && !window.matchMedia) {
    window.matchMedia = (query) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
    });
}
