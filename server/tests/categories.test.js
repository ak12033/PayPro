import { describe, it, expect } from 'vitest';
import {
    CATEGORIES,
    CATEGORY_NAMES,
    SYSTEM_CATEGORIES,
    EXCLUDED_FROM_BUDGET,
    categoryGroup,
    categoryKind,
} from '../constants/categories.js';

describe('categories.js (Phase 3 additions)', () => {
    it('adds income categories additively, without touching any existing entry', () => {
        const incomeNames = ['Salary', 'Freelance', 'Business Income', 'Interest & Investment Income', 'Other Income'];
        for (const name of incomeNames) {
            expect(CATEGORY_NAMES).toContain(name);
        }
        // Every pre-existing category name from Phase 1 is still present and unrenamed.
        for (const name of ['Food', 'Groceries', 'Transport', 'Rent', 'Others']) {
            expect(CATEGORY_NAMES).toContain(name);
        }
    });

    it('every category in CATEGORIES has an icon', () => {
        for (const c of CATEGORIES) {
            expect(typeof c.icon).toBe('string');
            expect(c.icon.length).toBeGreaterThan(0);
        }
    });

    it('categoryGroup/categoryKind classify income categories correctly', () => {
        expect(categoryKind('Salary')).toBe('income');
        expect(categoryGroup('Salary')).toBe('income');
        expect(categoryKind('Rent')).toBe('expense');
        expect(categoryGroup('Rent')).toBe('fixed');
    });

    it('falls back safely for an unmapped/legacy category name', () => {
        expect(categoryGroup('SomeLegacyCategoryNoOneMapped')).toBe('other');
        expect(categoryKind('SomeLegacyCategoryNoOneMapped')).toBe('expense');
    });

    it('EXCLUDED_FROM_BUDGET contains the reversal/legacy categories, not real spend categories', () => {
        expect(EXCLUDED_FROM_BUDGET).toContain('Refund');
        expect(EXCLUDED_FROM_BUDGET).toContain('Stripe');
        expect(EXCLUDED_FROM_BUDGET).not.toContain('Transfer');
        expect(EXCLUDED_FROM_BUDGET).not.toContain('Food');
    });

    it('SYSTEM_CATEGORIES are not part of the user-pickable CATEGORIES list', () => {
        for (const sys of SYSTEM_CATEGORIES) {
            expect(CATEGORY_NAMES).not.toContain(sys);
        }
    });
});
