#!/usr/bin/env node
/**
 * Secret-hygiene check (plan.md §4.13, Phase 1 "rotate secrets").
 *
 *   node scripts/checkSecrets.js        # or: npm run secrets:check
 *
 * Fails (exit 1) when:
 *   - git tracks an env file or a credential file
 *   - a tracked file contains a PEM private key
 *   - a credential file sits anywhere in the working tree, ignored or not
 *   - the checkout is inside a cloud-synced folder AND holds env/credential files
 *
 * Reports, without failing, the local `.env` files present — normal for
 * development, as long as the folder is not synced.
 *
 * Runs in CI, where only the tracked-file checks can find anything; locally it
 * also catches the key that .gitignore hides from `git status`. It never prints
 * a secret: only paths.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    PRIVATE_KEY_PATTERN,
    detectSyncedFolder,
    findCredentialFiles,
    isEnvFileName,
    trackedSecretFiles,
} from '../utils/secretHygiene.js';

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const git = (args) => execFileSync('git', args, { cwd: SERVER_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

const listEnvFiles = (root) => {
    const found = [];
    const walk = (dir, level) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                if (level < 2 && !['node_modules', '.git', '.venv', 'venv'].includes(entry.name)) {
                    walk(path.join(dir, entry.name), level + 1);
                }
            } else if (isEnvFileName(entry.name)) {
                found.push(path.join(dir, entry.name));
            }
        }
    };
    walk(root, 0);
    return found;
};

const main = () => {
    let root;
    let tracked = [];
    try {
        root = git(['rev-parse', '--show-toplevel']).trim();
        tracked = git(['ls-files', '-z']).split('\0').filter(Boolean);
    } catch {
        root = path.resolve(SERVER_ROOT, '..');
        console.warn('⚠️  Not a git checkout (or git is unavailable) — tracked-file checks skipped.');
    }

    const failures = [];
    const rel = (p) => path.relative(root, p) || p;

    const trackedSecrets = trackedSecretFiles(tracked);
    if (trackedSecrets.length) {
        failures.push(`git tracks secret files: ${trackedSecrets.join(', ')} — remove them (git rm --cached), rotate every value they held, and purge them from history.`);
    }

    const keyBearing = tracked.filter((p) => {
        const full = path.join(root, p);
        try {
            const stat = fs.statSync(full);
            if (!stat.isFile() || stat.size > 5 * 1024 * 1024) return false;
            return PRIVATE_KEY_PATTERN.test(fs.readFileSync(full, 'utf8'));
        } catch {
            return false;
        }
    });
    if (keyBearing.length) {
        failures.push(`tracked files contain a private key: ${keyBearing.join(', ')} — rotate that key; it is in git history.`);
    }

    const credentialFiles = findCredentialFiles(root);
    if (credentialFiles.length) {
        failures.push(`credential file(s) in the working tree: ${credentialFiles.map(rel).join(', ')} — move the key outside the repository and load it with FIREBASE_SERVICE_ACCOUNT_FILE (or FIREBASE_SERVICE_ACCOUNT). If this folder was ever synced or shared, rotate the key first.`);
    }

    const envFiles = listEnvFiles(root);
    const synced = detectSyncedFolder(root);
    if (synced && (envFiles.length || credentialFiles.length)) {
        failures.push(`the checkout is inside a cloud-synced folder (${synced}) and holds secrets — move the checkout, or keep env files outside it (DOTENV_CONFIG_PATH / ENV_FILE).`);
    }

    console.log('\n═══ PayPro secret hygiene ═══');
    console.log(`Checkout      : ${root}`);
    console.log(`Synced folder : ${synced ?? 'no'}`);
    console.log(`Tracked files : ${tracked.length} scanned`);
    console.log(`Local .env    : ${envFiles.length ? envFiles.map(rel).join(', ') : 'none'} (ignored by git; fine outside a synced folder)`);

    if (failures.length) {
        console.log(`\n❌ ${failures.length} problem(s):`);
        for (const failure of failures) console.log(`  - ${failure}`);
        console.log('\nRotation runbook: README.md → "Secrets".\n');
        return 1;
    }
    console.log('\n✅ CLEAN\n');
    return 0;
};

process.exit(main());
