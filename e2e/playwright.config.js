import { defineConfig, devices } from '@playwright/test';
import { API_URL, WEB_URL, WEB_PORT } from './stack/ports.js';

/**
 * End-to-end tests (plan.md §43.6).
 *
 * Two web servers: `stack/start-api.mjs` (in-memory MongoDB + the real API) and
 * the Vite dev server pointed at it. Tests seed through the public API where
 * they can and write to the database only for what no endpoint offers (a
 * balance, a role, a drifted account).
 *
 * Serial, one worker: every spec shares the one database, and the money specs
 * assert on absolute balances.
 */
export default defineConfig({
    testDir: './tests',
    fullyParallel: false,
    workers: 1,
    retries: process.env.CI ? 1 : 0,
    timeout: 60_000,
    expect: { timeout: 10_000 },
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: {
        baseURL: WEB_URL,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ],
    webServer: [
        {
            command: 'node stack/start-api.mjs',
            url: `${API_URL}/ready`,
            timeout: 180_000,
            reuseExistingServer: !process.env.CI,
            stdout: 'pipe',
            stderr: 'pipe',
        },
        {
            command: `npm run dev -- --port ${WEB_PORT} --strictPort`,
            cwd: '../client',
            url: WEB_URL,
            timeout: 120_000,
            reuseExistingServer: !process.env.CI,
            env: {
                VITE_BACKEND_URL: API_URL,
                VITE_FASTAPI_URL: 'http://127.0.0.1:9',
            },
        },
    ],
});
