import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Separate from vite.config.js on purpose.
 *
 * The Tailwind Vite plugin processes CSS on every build, which vitest's
 * jsdom environment has no use for and which slows every test run down for
 * no benefit — none of these tests render actual styles.
 */
export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        setupFiles: ['./src/testSetup.js'],
        css: false,
    },
});
