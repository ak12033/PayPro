import fs from 'fs';
import path from 'path';

/**
 * Where secrets live on disk (plan.md §4.13, Phase 1 "rotate secrets").
 *
 * The audit found a live Firebase service-account key at the repository root,
 * inside a OneDrive-synced folder. `.gitignore` kept it out of git, but not out
 * of Microsoft's cloud or every machine signed into that account. Ignoring a
 * file is not the same as not having it — this module is how the server and
 * `npm run secrets:check` notice the difference.
 *
 * Everything here is pure or takes its inputs explicitly (env, directories), so
 * it is testable without touching the real tree.
 */

/** Filenames that hold a live credential. Kept in step with the root .gitignore. */
export const CREDENTIAL_FILE_PATTERNS = [
    /firebase.*adminsdk.*\.json$/i,
    /service[-_]?account.*\.json$/i,
    /\.(pem|p12|pfx|key)$/i,
];

export const isCredentialFileName = (name) =>
    CREDENTIAL_FILE_PATTERNS.some((pattern) => pattern.test(name));

/** `.env`, `.env.local`, `.env.production` … but never the checked-in template. */
export const isEnvFileName = (name) => /^\.env(\..+)?$/.test(name) && name !== '.env.example';

/**
 * A PEM private-key header. Matches the escaped form inside a service-account
 * JSON (`"-----BEGIN PRIVATE KEY-----\n..."`) as well as a bare .pem file.
 */
export const PRIVATE_KEY_PATTERN = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;

/** True when `child` is `parent` or anywhere beneath it. */
export const isInside = (child, parent) => {
    const rel = path.relative(path.resolve(parent), path.resolve(child));
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

const SYNCED_SEGMENT = /^(onedrive( - .+)?|dropbox|google drive|googledrive|icloud ?drive|box sync)$/i;

/**
 * If `dir` sits inside a cloud-synced folder, return that folder's root.
 *
 * Two signals: the roots OneDrive publishes as environment variables on
 * Windows, and the conventional folder names every sync client uses — the
 * latter covers Dropbox/Drive/iCloud, which publish nothing.
 */
export const detectSyncedFolder = (dir, env = process.env) => {
    const roots = [env.OneDrive, env.OneDriveConsumer, env.OneDriveCommercial].filter(Boolean);
    const byEnv = roots.find((root) => isInside(dir, root));
    if (byEnv) return path.resolve(byEnv);

    const segments = path.resolve(dir).split(/[\\/]+/);
    const index = segments.findIndex((segment) => SYNCED_SEGMENT.test(segment));
    return index === -1 ? null : segments.slice(0, index + 1).join(path.sep);
};

const SKIP_DIRS = new Set([
    'node_modules', '.git', '.venv', 'venv', '__pycache__', 'dist', 'build', 'coverage',
    '.pytest_cache', '.ruff_cache',
]);

/**
 * Credential files under `root`. `depth: 0` reads only `root` itself — what the
 * server does at boot, where a recursive walk of a container's filesystem would
 * be both slow and pointless. The CLI walks the whole repository.
 */
export const findCredentialFiles = (root, { depth = Infinity } = {}) => {
    const found = [];
    const walk = (dir, level) => {
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (level < depth && !SKIP_DIRS.has(entry.name)) walk(full, level + 1);
            } else if (isCredentialFileName(entry.name)) {
                found.push(full);
            }
        }
    };
    walk(root, 0);
    return found;
};

/** Tracked paths (from `git ls-files`) that should never be in git. */
export const trackedSecretFiles = (trackedPaths) =>
    trackedPaths.filter((p) => {
        const name = path.basename(p);
        return isCredentialFileName(name) || isEnvFileName(name);
    });

/**
 * Boot-time audit of where this process's secrets are coming from.
 *
 * Returns findings rather than logging or exiting, so `validateConfig` decides
 * the consequence and tests can assert on it. Levels:
 *   `fatal` — refuse to start (production only)
 *   `error` / `warn` — log and continue
 *
 * `projectRoot` is the checkout (the server dir's parent when that holds a
 * `.git`), or the server dir itself in a container where there is no parent
 * repository.
 */
export const auditSecretLocations = ({ serverRoot, projectRoot = serverRoot, env = process.env }) => {
    const production = env.NODE_ENV === 'production';
    const findings = [];

    // A credential *file* the process is configured to read, sitting in the
    // project. In production that means the key is in the image or the deploy
    // artifact — exactly the replication problem, made permanent.
    for (const name of ['FIREBASE_SERVICE_ACCOUNT_FILE', 'GOOGLE_APPLICATION_CREDENTIALS']) {
        const configured = env[name];
        if (configured && isInside(configured, projectRoot)) {
            findings.push({
                level: production ? 'fatal' : 'warn',
                code: 'CREDENTIAL_PATH_IN_TREE',
                message: `${name} points inside the project (${configured}). Keep the key outside the source tree — or in a secret manager — and point at it from there.`,
            });
        }
    }

    // Stray downloads next to the code, whether or not anything reads them.
    const stray = [
        ...findCredentialFiles(serverRoot, { depth: 1 }),
        ...(projectRoot !== serverRoot ? findCredentialFiles(projectRoot, { depth: 0 }) : []),
    ];
    if (stray.length) {
        findings.push({
            level: production ? 'error' : 'warn',
            code: 'CREDENTIAL_FILE_IN_TREE',
            message: `Credential file(s) found in the project: ${stray.map((f) => path.relative(projectRoot, f)).join(', ')}. Rotate the key if this folder has ever been synced or shared, then move it out — see README "Secrets".`,
        });
    }

    const synced = detectSyncedFolder(projectRoot, env);
    if (synced) {
        findings.push({
            level: production ? 'error' : 'warn',
            code: 'PROJECT_IN_SYNCED_FOLDER',
            message: `The project is inside a cloud-synced folder (${synced}); every .env and key file in it is replicated off this machine. Move the checkout, or load secrets from outside it (DOTENV_CONFIG_PATH, FIREBASE_SERVICE_ACCOUNT_FILE).`,
        });
    }

    return findings;
};

/** The project root for a server directory: its parent when that is a git checkout. */
export const projectRootFor = (serverRoot) => {
    const parent = path.resolve(serverRoot, '..');
    return fs.existsSync(path.join(parent, '.git')) ? parent : serverRoot;
};
