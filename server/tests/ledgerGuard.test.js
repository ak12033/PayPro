import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * The lint-level guard plan.md §29.2 asks for: no code outside the modules
 * that own balances may write one.
 *
 * `ledgerService.js` exists because four real bugs came from balance writes
 * scattered through controllers (see its header). Nothing *enforced* that the
 * scattering stayed gone — a later `User.updateOne({$inc: {accountBalance}})`
 * in some new controller would pass review as "looks atomic". This test fails
 * the build instead.
 *
 * Deliberately a source scan, not a runtime check: the failure we care about
 * is a code path that exists, whether or not any test happens to exercise it.
 */

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The only modules allowed to write a balance, and why. */
const ALLOWED = new Set([
    'services/ledgerService.js',          // every movement of money
    'services/reconciliationService.js',  // repair: moves a drifted balance to match its ledger
    'services/minorBackfillService.js',   // §7.4 step 2: derives balanceMinor from accountBalance
]);

const SKIP_DIRS = new Set(['node_modules', 'tests', 'coverage', '.git']);

const listSourceFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : listSourceFiles(path.join(dir, entry.name));
    return entry.name.endsWith('.js') ? [path.join(dir, entry.name)] : [];
});

/** Strip comments so the explanatory "sender.accountBalance -= amount" examples don't trip the guard. */
const stripComments = (source) => source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const WRITE_PATTERNS = [
    // An update operator whose object names a balance field, across lines.
    /\$(inc|set|unset|mul|min|max|rename)\s*:\s*\{[^}]*\b(accountBalance|balanceMinor)\b/,
    // Direct assignment on a document: user.accountBalance = / += / -=
    /\.(accountBalance|balanceMinor)\s*[-+*/]?=(?!=)/,
];

describe('balance writes are confined to the ledger modules (plan.md §29.2)', () => {
    const files = listSourceFiles(SERVER_ROOT);

    it('finds the source tree (guards against a scan that silently checks nothing)', () => {
        expect(files.length).toBeGreaterThan(50);
        expect(files.some((f) => f.endsWith(path.join('services', 'ledgerService.js')))).toBe(true);
    });

    it('no other module writes accountBalance or balanceMinor', () => {
        const offenders = files
            .map((file) => ({ rel: path.relative(SERVER_ROOT, file).split(path.sep).join('/'), file }))
            .filter(({ rel }) => !ALLOWED.has(rel))
            .filter(({ file }) => {
                const source = stripComments(fs.readFileSync(file, 'utf8'));
                return WRITE_PATTERNS.some((pattern) => pattern.test(source));
            })
            .map(({ rel }) => rel);

        expect(offenders, `Balance written outside ledgerService: ${offenders.join(', ')}`).toEqual([]);
    });

    it('the guard itself catches the forbidden forms', () => {
        const caught = (src) => WRITE_PATTERNS.some((p) => p.test(stripComments(src)));
        expect(caught('User.updateOne({ _id }, { $inc: { accountBalance: 5 } })')).toBe(true);
        expect(caught('User.updateOne({ _id }, {\n  $set: {\n    balanceMinor: 0\n  }\n})')).toBe(true);
        expect(caught('user.accountBalance -= amount;')).toBe(true);
        expect(caught('// user.accountBalance -= amount;')).toBe(false);
        expect(caught('if (user.accountBalance === 0) {}')).toBe(false);
        expect(caught("User.find().select('accountBalance')")).toBe(false);
    });
});
