import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { beforeAll, afterAll, afterEach } from 'vitest';

/**
 * Test database.
 *
 * A *replica set* rather than a standalone server: the ledger service uses
 * multi-document transactions, and those are unavailable on a standalone
 * mongod. Testing against a standalone would silently exercise the
 * compensating-write fallback path instead of the real one used in production,
 * so the tests would not prove what they claim to prove.
 */
let replSet;

beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({
        replSet: { count: 1, storageEngine: 'wiredTiger' },
    });

    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-that-is-at-least-32-chars-long!!';
    process.env.MONGO_URI = replSet.getUri();

    await mongoose.connect(replSet.getUri('paypro_test'));
}, 120000);

afterEach(async () => {
    // Isolate tests: a leaked document from one test silently changes the
    // arithmetic of the next, which is how balance tests become flaky.
    const { collections } = mongoose.connection;
    await Promise.all(
        Object.values(collections).map((c) => c.deleteMany({}))
    );
});

afterAll(async () => {
    await mongoose.disconnect();
    await replSet?.stop();
}, 60000);
