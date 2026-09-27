import { describe, it, expect, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import {
    scrubEvent, scrubString, reportError, __setErrorTrackingClient, isErrorTrackingEnabled,
} from '../utils/errorTracking.js';
import logger from '../utils/logger.js';
import { errorHandler } from '../middlewares/errorHandler.js';
import { LedgerError } from '../services/ledgerService.js';

/**
 * plan.md §39.2: error tracking on the API, with PII scrubbing for amounts,
 * emails and IPs. The SDK itself is never loaded here — a fake client stands in
 * for it through the test seam, so these tests exercise exactly what this
 * codebase decides to send, not Sentry's transport.
 */

const fakeClient = () => {
    const events = [];
    let scope;
    const client = {
        events,
        withScope: (fn) => {
            scope = { tags: {}, extras: {}, user: null };
            fn({
                setTag: (k, v) => { scope.tags[k] = v; },
                setExtras: (x) => { scope.extras = x; },
                setUser: (u) => { scope.user = u; },
            });
        },
        captureException: (err) => events.push({ kind: 'exception', err, ...scope }),
        captureMessage: (message, level) => events.push({ kind: 'message', message, level, ...scope }),
        flush: vi.fn(),
    };
    return client;
};

afterEach(() => __setErrorTrackingClient(null));

describe('errorTracking: disabled by default', () => {
    it('is off without SENTRY_DSN, and reporting is a no-op', () => {
        expect(isErrorTrackingEnabled()).toBe(false);
        expect(() => reportError({ message: 'x' })).not.toThrow();
    });
});

describe('scrubString', () => {
    it('masks emails, IPv4 addresses and rupee figures in free text', () => {
        expect(scrubString('bob.smith+x@example.co.in paid ₹1,250.50 from 203.0.113.9'))
            .toBe('[email] paid ₹[amount] from [ip]');
    });

    it('leaves non-strings alone', () => {
        expect(scrubString(42)).toBe(42);
        expect(scrubString(undefined)).toBeUndefined();
    });
});

describe('scrubEvent', () => {
    it('removes amounts, balances, emails, IPs and credentials from nested data, keeping the rest', () => {
        const event = scrubEvent({
            extra: {
                orderId: 'order_1',
                amount: 500,
                amountMinor: 50000,
                newBalance: 10,
                user: { email: 'a@b.co', ip: '10.0.0.1', id: 'u1' },
                headers: { authorization: 'Bearer x', 'x-csrf-token': 'c' },
                note: 'refund for a@b.co',
            },
        });
        expect(event.extra).toEqual({
            orderId: 'order_1',
            amount: '[Filtered]',
            amountMinor: '[Filtered]',
            newBalance: '[Filtered]',
            user: { email: '[Filtered]', ip: '[Filtered]', id: 'u1' },
            headers: { authorization: '[Filtered]', 'x-csrf-token': '[Filtered]' },
            note: 'refund for [email]',
        });
    });

    it('keeps only the user id', () => {
        const event = scrubEvent({ user: { id: 'u1', email: 'a@b.co', ip_address: '10.0.0.1', username: 'bob' } });
        expect(event.user).toEqual({ id: 'u1' });
    });

    it('drops request bodies, cookies, the query string and identifying headers', () => {
        const event = scrubEvent({
            request: {
                method: 'POST',
                url: 'https://api.example.com/api/users/all?search=bob@example.com',
                data: { password: 'hunter2', amount: 10 },
                cookies: { refreshToken: 'r' },
                query_string: 'search=bob@example.com',
                headers: { 'user-agent': 'UA', cookie: 'a=b', 'x-forwarded-for': '10.0.0.1', authorization: 'Bearer x' },
            },
        });
        expect(event.request).toEqual({
            method: 'POST',
            url: 'https://api.example.com/api/users/all',
            headers: { 'user-agent': 'UA' },
        });
    });

    it('scrubs exception values, the message and breadcrumbs', () => {
        const event = scrubEvent({
            message: 'failed for a@b.co',
            exception: { values: [{ type: 'Error', value: 'charge of ₹99 failed' }] },
            breadcrumbs: [{ message: 'GET from 10.1.1.1', data: { amount: 5, path: '/x' } }],
        });
        expect(event.message).toBe('failed for [email]');
        expect(event.exception.values[0].value).toBe('charge of ₹[amount] failed');
        expect(event.breadcrumbs[0]).toEqual({ message: 'GET from [ip]', data: { amount: '[Filtered]', path: '/x' } });
    });
});

describe('logger → error tracking', () => {
    it('forwards logger.error with the real Error when `err` is given', () => {
        const client = fakeClient();
        __setErrorTrackingClient(client);

        const err = new Error('settlement exploded');
        logger.error('Failed to credit wallet for order', { orderId: 'order_9', err });

        expect(client.events).toHaveLength(1);
        expect(client.events[0].kind).toBe('exception');
        expect(client.events[0].err).toBe(err);
        expect(client.events[0].extras).toMatchObject({ orderId: 'order_9', logMessage: 'Failed to credit wallet for order' });
    });

    it('forwards logger.error without an Error as a message event', () => {
        const client = fakeClient();
        __setErrorTrackingClient(client);

        logger.error('Paise backfill incomplete', { usersMismatched: 3 });

        expect(client.events).toEqual([expect.objectContaining({ kind: 'message', message: 'Paise backfill incomplete', level: 'error' })]);
    });

    it('does not forward warn/info', () => {
        const client = fakeClient();
        __setErrorTrackingClient(client);

        logger.warn('just a warning');
        logger.info('fyi');

        expect(client.events).toHaveLength(0);
    });

    it('a failing tracker never breaks the caller', () => {
        __setErrorTrackingClient({ withScope: () => { throw new Error('tracker down'); } });
        expect(() => logger.error('still fine')).not.toThrow();
    });
});

describe('errorHandler → error tracking', () => {
    const appThrowing = (err) => {
        const app = express();
        app.get('/boom', () => { throw err; });
        app.use(errorHandler);
        return app;
    };

    it('reports a 5xx with its stack', async () => {
        const client = fakeClient();
        __setErrorTrackingClient(client);

        const err = new Error('database on fire');
        const res = await request(appThrowing(err)).get('/boom?email=a@b.co');

        expect(res.status).toBe(500);
        expect(client.events).toHaveLength(1);
        expect(client.events[0].err).toBe(err);
        // The query string (which can carry a searched email) is not recorded.
        expect(client.events[0].extras.url).toBe('/boom');
    });

    it('does not report client errors', async () => {
        const client = fakeClient();
        __setErrorTrackingClient(client);

        const res = await request(appThrowing(new LedgerError('INSUFFICIENT_FUNDS', 'Insufficient balance', 400))).get('/boom');
        expect(res.status).toBe(400);

        const notFound = Object.assign(new Error('nope'), { status: 404 });
        expect((await request(appThrowing(notFound)).get('/boom')).status).toBe(404);

        expect(client.events).toHaveLength(0);
    });
});
