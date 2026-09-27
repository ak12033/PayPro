import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    PRIVATE_KEY_PATTERN,
    auditSecretLocations,
    detectSyncedFolder,
    findCredentialFiles,
    isCredentialFileName,
    isEnvFileName,
    isInside,
    trackedSecretFiles,
} from '../utils/secretHygiene.js';
import { parseServiceAccount, resolveFirebaseCredential } from '../utils/firebaseCredential.js';

/**
 * plan.md §4.13 / Phase 1 "rotate secrets": a live Firebase key sat in a
 * OneDrive-synced checkout. These tests pin the three things that keep that
 * from recurring silently — the key can be loaded from outside the tree, the
 * server notices one inside it, and git can never carry one.
 */

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Built by concatenation so this file never contains the literal header the
// repository scan looks for.
const PEM_HEADER = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');
const SERVICE_ACCOUNT = {
    type: 'service_account',
    project_id: 'demo',
    client_email: 'push@demo.iam.gserviceaccount.com',
    private_key: `${PEM_HEADER}\\nabc\\n-----END PRIVATE KEY-----\\n`,
};

describe('credential and env file names', () => {
    it('recognises the downloaded Firebase key and generic service-account files', () => {
        expect(isCredentialFileName('paypro-64e9a-firebase-adminsdk-fbsvc-9d02f4bb97.json')).toBe(true);
        expect(isCredentialFileName('service-account.json')).toBe(true);
        expect(isCredentialFileName('serviceAccountKey.json')).toBe(true);
        expect(isCredentialFileName('server.pem')).toBe(true);
    });

    it('leaves ordinary project files alone', () => {
        expect(isCredentialFileName('package.json')).toBe(false);
        expect(isCredentialFileName('firebase-messaging-sw.js')).toBe(false);
        expect(isCredentialFileName('firebaseApp.js')).toBe(false);
    });

    it('treats every .env variant except the template as secret', () => {
        expect(isEnvFileName('.env')).toBe(true);
        expect(isEnvFileName('.env.production')).toBe(true);
        expect(isEnvFileName('.env.example')).toBe(false);
        expect(isEnvFileName('env.js')).toBe(false);
    });

    it('flags only secret paths among tracked files', () => {
        expect(trackedSecretFiles([
            'server/.env.example', 'server/config/env.js', 'server/.env', 'keys/firebase-adminsdk-x.json',
        ])).toEqual(['server/.env', 'keys/firebase-adminsdk-x.json']);
    });

    it('the private-key pattern matches the escaped form inside a service-account JSON', () => {
        expect(PRIVATE_KEY_PATTERN.test(JSON.stringify(SERVICE_ACCOUNT))).toBe(true);
        expect(PRIVATE_KEY_PATTERN.test('BEGIN CERTIFICATE')).toBe(false);
    });
});

describe('location checks', () => {
    it('isInside does not confuse a sibling that shares a prefix', () => {
        const base = path.join(os.tmpdir(), 'paypro');
        expect(isInside(path.join(base, 'server', '.env'), base)).toBe(true);
        expect(isInside(base, base)).toBe(true);
        expect(isInside(`${base}-keys${path.sep}key.json`, base)).toBe(false);
    });

    it('detects a OneDrive checkout from the environment and by folder name', () => {
        const oneDrive = path.join(os.tmpdir(), 'someone', 'OneDrive');
        expect(detectSyncedFolder(path.join(oneDrive, 'PayPro'), { OneDrive: oneDrive })).toBe(path.resolve(oneDrive));

        const dropbox = path.join(os.tmpdir(), 'Dropbox');
        expect(detectSyncedFolder(path.join(dropbox, 'code', 'PayPro'), {})).toBe(path.resolve(dropbox));

        expect(detectSyncedFolder(path.join(os.tmpdir(), 'code', 'PayPro'), { OneDrive: oneDrive })).toBeNull();
    });

    describe('with a scratch project on disk', () => {
        let project;
        let server;

        beforeAll(() => {
            project = fs.mkdtempSync(path.join(os.tmpdir(), 'paypro-secrets-'));
            server = path.join(project, 'server');
            fs.mkdirSync(path.join(server, 'config'), { recursive: true });
            fs.mkdirSync(path.join(server, 'node_modules', 'pkg'), { recursive: true });
            fs.writeFileSync(path.join(project, 'paypro-firebase-adminsdk-abc.json'), '{}');
            fs.writeFileSync(path.join(server, 'node_modules', 'pkg', 'service-account.json'), '{}');
            fs.writeFileSync(path.join(server, 'config', 'db.js'), '');
        });

        afterAll(() => fs.rmSync(project, { recursive: true, force: true }));

        it('finds credential files but never descends into node_modules', () => {
            expect(findCredentialFiles(project).map((f) => path.basename(f)))
                .toEqual(['paypro-firebase-adminsdk-abc.json']);
            expect(findCredentialFiles(server)).toEqual([]);
        });

        it('reports a stray key at the project root', () => {
            const findings = auditSecretLocations({ serverRoot: server, projectRoot: project, env: { NODE_ENV: 'development' } });
            expect(findings.map((f) => [f.code, f.level])).toEqual([['CREDENTIAL_FILE_IN_TREE', 'warn']]);
        });

        it('refuses to boot production with a credential path inside the project', () => {
            const env = { NODE_ENV: 'production', FIREBASE_SERVICE_ACCOUNT_FILE: path.join(server, 'config', 'key.json') };
            const findings = auditSecretLocations({ serverRoot: server, projectRoot: project, env });
            expect(findings.find((f) => f.code === 'CREDENTIAL_PATH_IN_TREE')?.level).toBe('fatal');
        });

        it('accepts a credential path outside the project', () => {
            const env = { NODE_ENV: 'production', FIREBASE_SERVICE_ACCOUNT_FILE: path.join(os.tmpdir(), 'elsewhere', 'key.json') };
            const findings = auditSecretLocations({ serverRoot: server, projectRoot: server, env });
            expect(findings).toEqual([]);
        });

        it('reports a checkout inside a synced folder', () => {
            const findings = auditSecretLocations({ serverRoot: server, projectRoot: server, env: { OneDrive: project } });
            expect(findings.map((f) => f.code)).toEqual(['PROJECT_IN_SYNCED_FOLDER']);
        });
    });
});

describe('Firebase credential resolution', () => {
    const json = JSON.stringify(SERVICE_ACCOUNT);

    it('parses raw JSON and restores escaped newlines in the key', () => {
        const { serviceAccount } = parseServiceAccount(json);
        expect(serviceAccount.private_key).toContain('\nabc\n');
    });

    it('parses base64', () => {
        const { serviceAccount } = parseServiceAccount(Buffer.from(json).toString('base64'));
        expect(serviceAccount.client_email).toBe(SERVICE_ACCOUNT.client_email);
    });

    it('rejects JSON that is not a service account', () => {
        expect(parseServiceAccount('{"type":"x"}').error).toMatch(/private_key/);
    });

    it('prefers the inline variable over a file', () => {
        const readFile = () => { throw new Error('should not read'); };
        const result = resolveFirebaseCredential({ FIREBASE_SERVICE_ACCOUNT: json, FIREBASE_SERVICE_ACCOUNT_FILE: '/k.json' }, { readFile });
        expect(result.source).toBe('env');
        expect(result.errors).toEqual([]);
    });

    it('reads a key kept outside the tree via FIREBASE_SERVICE_ACCOUNT_FILE', () => {
        const readFile = (file) => (file === '/secrets/paypro/key.json' ? json : null);
        const result = resolveFirebaseCredential({ FIREBASE_SERVICE_ACCOUNT_FILE: '/secrets/paypro/key.json' }, { readFile });
        expect(result.source).toBe('file');
        expect(result.serviceAccount.project_id).toBe('demo');
    });

    it('reports a broken source and falls through to application default credentials', () => {
        const readFile = () => { const err = new Error('nope'); err.code = 'ENOENT'; throw err; };
        const result = resolveFirebaseCredential({
            FIREBASE_SERVICE_ACCOUNT: 'not json',
            FIREBASE_SERVICE_ACCOUNT_FILE: '/missing.json',
            GOOGLE_APPLICATION_CREDENTIALS: '/adc.json',
        }, { readFile });
        expect(result.source).toBe('adc');
        expect(result.errors).toHaveLength(2);
        expect(result.errors[1]).toContain('ENOENT');
    });

    it('is "none" when nothing is configured, so push is mocked rather than crashing', () => {
        expect(resolveFirebaseCredential({})).toEqual({ source: 'none', errors: [] });
    });
});

describe('the repository itself', () => {
    let tracked = null;
    try {
        tracked = execFileSync('git', ['ls-files', '-z'], { cwd: SERVER_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
            .split('\0').filter(Boolean);
    } catch {
        // Not a git checkout (e.g. a packaged build) — nothing to scan.
    }

    it.skipIf(!tracked)('tracks no env or credential file', () => {
        expect(trackedSecretFiles(tracked)).toEqual([]);
    });

    it.skipIf(!tracked)('.gitignore covers the credential and env names the server looks for', () => {
        const ignored = (p) => {
            try {
                execFileSync('git', ['check-ignore', '-q', '--no-index', p], { cwd: SERVER_ROOT, stdio: 'ignore' });
                return true;
            } catch {
                return false;
            }
        };
        for (const p of ['../paypro-x-firebase-adminsdk-y.json', 'config/service-account.json', '.env', '../client/.env.production', 'keys/server.pem']) {
            expect(ignored(p), p).toBe(true);
        }
        expect(ignored('.env.example')).toBe(false);
    });
});
