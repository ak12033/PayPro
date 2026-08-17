import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        globals: false,
        setupFiles: ['./tests/setup.js'],
        // Spinning up a replica set is slow on first run (it downloads a mongod
        // binary), and the money tests deliberately exercise contention.
        testTimeout: 30000,
        hookTimeout: 120000,
        // Money tests assert on absolute balances in a shared database, so they
        // must not run concurrently with each other.
        fileParallelism: false,
        include: ['tests/**/*.test.js'],
    },
});
