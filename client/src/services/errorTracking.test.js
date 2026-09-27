import { describe, it, expect, afterEach, vi } from 'vitest';
import {
    scrubEvent, scrubBreadcrumb, scrubString, reportError, __setErrorTrackingClient,
} from './errorTracking';

afterEach(() => __setErrorTrackingClient(null));

describe('scrubString', () => {
    it('masks emails, IPs and rupee figures', () => {
        expect(scrubString('sent ₹1,200.50 to a.b@example.com from 10.0.0.2'))
            .toBe('sent ₹[amount] to [email] from [ip]');
    });
});

describe('scrubEvent', () => {
    it('filters amounts, balances and emails from nested data and keeps only the user id', () => {
        const event = scrubEvent({
            user: { id: 'u1', email: 'a@b.co', ip_address: '10.0.0.1' },
            extra: { componentStack: 'at Home', newBalanceMinor: 500, form: { amount: '250', email: 'a@b.co', note: 'rent' } },
        });
        expect(event.user).toEqual({ id: 'u1' });
        expect(event.extra).toEqual({
            componentStack: 'at Home',
            newBalanceMinor: '[Filtered]',
            form: { amount: '[Filtered]', email: '[Filtered]', note: 'rent' },
        });
    });

    it('drops the query string and every header but the user agent', () => {
        const event = scrubEvent({
            request: { url: 'https://app.example.com/money/send?to=a@b.co', headers: { 'User-Agent': 'UA', Referer: 'x' } },
        });
        expect(event.request).toEqual({ url: 'https://app.example.com/money/send', headers: { 'User-Agent': 'UA' } });
    });

    it('scrubs exception values and breadcrumbs', () => {
        const event = scrubEvent({
            exception: { values: [{ type: 'TypeError', value: 'cannot read ₹500' }] },
            breadcrumbs: [{ category: 'fetch', data: { url: 'https://api/x/users/all?search=bob@x.io', method: 'GET' } }],
        });
        expect(event.exception.values[0].value).toBe('cannot read ₹[amount]');
        expect(event.breadcrumbs[0].data).toEqual({ url: 'https://api/x/users/all', method: 'GET' });
    });

    it('scrubs a breadcrumb on its own (the beforeBreadcrumb hook)', () => {
        expect(scrubBreadcrumb({ message: 'input a@b.co', data: { balance: 3 } }))
            .toEqual({ message: 'input [email]', data: { balance: '[Filtered]' } });
    });
});

describe('reportError', () => {
    it('is a no-op when tracking is off', () => {
        expect(() => reportError(new Error('x'))).not.toThrow();
    });

    it('captures the error with its context when tracking is on', () => {
        const scope = { setExtras: vi.fn() };
        const client = { withScope: (fn) => fn(scope), captureException: vi.fn() };
        __setErrorTrackingClient(client);

        const error = new Error('render failed');
        reportError(error, { componentStack: 'at X' });

        expect(scope.setExtras).toHaveBeenCalledWith({ componentStack: 'at X' });
        expect(client.captureException).toHaveBeenCalledWith(error);
    });
});
