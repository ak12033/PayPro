import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ASSET_TYPES, LIABILITY_KINDS, assetColor, PORTFOLIO_DISCLAIMER } from './portfolio';
import { VIZ_SERIES, VIZ_OTHER } from '../../lib/chartTheme';

const serverList = (file, name) => {
    const source = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), `../../../../server/models/${file}`), 'utf8');
    const [, body] = source.match(new RegExp(`export const ${name} = \\[([^\\]]*)\\]`));
    return body.match(/'([a-z_]+)'/g).map((s) => s.slice(1, -1));
};

describe('portfolio vocabulary matches the server models', () => {
    it('asset types and liability kinds', () => {
        expect(ASSET_TYPES.map((t) => t.key)).toEqual(serverList('Holding.js', 'ASSET_TYPES'));
        expect(LIABILITY_KINDS.map((k) => k.key)).toEqual(serverList('Liability.js', 'LIABILITY_KINDS'));
    });
});

describe('assetColor', () => {
    it('follows identity in fixed slot order, and "other" is the neutral', () => {
        expect(assetColor('mf')).toBe(VIZ_SERIES[0]);
        expect(assetColor('gold')).toBe(VIZ_SERIES[5]);
        expect(assetColor('other')).toBe(VIZ_OTHER);
        expect(assetColor('nonsense')).toBe(VIZ_OTHER);
    });
});

it('the disclaimer says it is not advice or a credit score (plan.md §21, §22)', () => {
    expect(PORTFOLIO_DISCLAIMER).toMatch(/not investment advice|none of this is investment advice/);
    expect(PORTFOLIO_DISCLAIMER).toMatch(/credit score/);
});
