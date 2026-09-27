import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PUSH_CATEGORIES, describeQuietHours, hourLabel } from './notificationCategories';

const POLICY = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../../server/services/notificationPolicy.js'
);

describe('PUSH_CATEGORIES matches the server policy', () => {
    it('offers exactly the categories the server lets a user mute', () => {
        const source = fs.readFileSync(POLICY, 'utf8');
        const [, list] = source.match(/MUTABLE_CATEGORIES = \[([^\]]*)\]/);
        const server = list.match(/'([a-z]+)'/g).map((s) => s.slice(1, -1)).sort();
        expect(PUSH_CATEGORIES.map((c) => c.key).sort()).toEqual(server);
    });

    it('never offers a switch for security alerts (plan.md §26.3)', () => {
        expect(PUSH_CATEGORIES.map((c) => c.key)).not.toContain('security');
    });
});

describe('quiet hours copy', () => {
    it('labels hours on a 12-hour clock', () => {
        expect(hourLabel(0)).toBe('12:00 AM');
        expect(hourLabel(22)).toBe('10:00 PM');
    });

    it('describes only a window that does something', () => {
        expect(describeQuietHours({ enabled: true, start: 22, end: 7 })).toBe('10:00 PM – 7:00 AM');
        expect(describeQuietHours({ enabled: false, start: 22, end: 7 })).toBeNull();
        expect(describeQuietHours({ enabled: true, start: 8, end: 8 })).toBeNull();
    });
});
