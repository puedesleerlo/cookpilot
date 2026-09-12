/**
 * Deploys the built client to Firebase Hosting through the REST API.
 *
 * Uses Application Default Credentials rather than the Firebase CLI's own session, which
 * means it works unattended — the same path a CI job takes, with no interactive login.
 *
 * It refuses to deploy a bundle that has not passed the secret scan. That check is not a
 * formality: this is the one step in the system that publishes bytes to the open web, and
 * it is the last place a leaked credential can be stopped.
 *
 * Run: node scripts/deploy-hosting.mjs [--site <siteId>] [--dry-run]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import process from 'node:process';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i > -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const DRY_RUN = argv.includes('--dry-run');

const root = process.cwd();
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? 'hackaton-508407';
const SITE = arg('site', PROJECT);
const DIST = path.join(root, arg('dist', 'apps/web/dist'));
const API = 'https://firebasehosting.googleapis.com/v1beta1';

const die = (message) => {
  console.error(`\ndeploy-hosting: ${message}\n`);
  process.exit(1);
};

// ------------------------------------------------------------- preflight

if (!existsSync(DIST)) die(`${DIST} does not exist. Build the client first.`);

/**
 * Nothing ships without the scan. Deploying is irreversible in the sense that matters — a
 * secret that reaches a CDN has been published, whatever is deleted afterwards.
 */
console.log('scanning the bundle before anything leaves this machine...');
try {
  execFileSync('node', [path.join(root, 'scripts/scan-bundle.mjs'), DIST], { stdio: 'inherit' });
} catch {
  die('the bundle scan failed. Nothing was deployed.');
}

const token = (() => {
  try {
    return execFileSync('gcloud', ['auth', 'application-default', 'print-access-token'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return die('could not get an access token. Run: gcloud auth application-default login');
  }
})();

const api = async (method, url, body, extraHeaders = {}) => {
  const res = await fetch(url.startsWith('http') ? url : `${API}${url}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'x-goog-user-project': PROJECT,
      ...(body !== undefined && !(body instanceof Uint8Array) ? { 'content-type': 'application/json' } : {}),
      ...extraHeaders,
    },
    ...(body === undefined ? {} : { body: body instanceof Uint8Array ? body : JSON.stringify(body) }),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) {
    die(`${method} ${url} -> ${res.status}\n  ${parsed?.error?.message ?? text.slice(0, 400)}`);
  }
  return parsed;
};

// --------------------------------------------------------------- the files

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.name === '.DS_Store') return [];
    return e.isDirectory() ? walk(full) : statSync(full).isFile() ? [full] : [];
  });

/** Hosting addresses files by the SHA-256 of their **gzipped** bytes, not their raw bytes. */
const files = walk(DIST).map((full) => {
  const raw = readFileSync(full);
  const gz = gzipSync(raw, { level: 9 });
  return {
    urlPath: `/${path.relative(DIST, full).split(path.sep).join('/')}`,
    hash: createHash('sha256').update(gz).digest('hex'),
    gz,
    rawBytes: raw.length,
  };
});

const totalKb = (files.reduce((n, f) => n + f.gz.length, 0) / 1024).toFixed(1);
console.log(`\n${files.length} files, ${totalKb} kB gzipped:`);
for (const f of files.sort((a, b) => b.gz.length - a.gz.length).slice(0, 8)) {
  console.log(`  ${(f.gz.length / 1024).toFixed(1).padStart(7)} kB  ${f.urlPath}`);
}

if (DRY_RUN) {
  console.log('\n--dry-run: stopping before any API call that changes anything.');
  process.exit(0);
}

// ------------------------------------------------------ the hosting config
// Sent with the version rather than configured on the site, so a rollback rolls the
// headers and rewrites back too.
const hostingConfig = {
  // A single-page app: every unknown path is the app's own router, not a 404.
  rewrites: [{ glob: '**', path: '/index.html' }],
  /**
   * Headers match on the REQUEST path, not the file the rewrite resolves to. A glob of
   * `/index.html` therefore never matches `/`, or `/intake`, or any other SPA route — the
   * first deploy shipped the app shell with a one-hour cache for exactly that reason, which
   * would have meant a redeploy taking an hour to reach anyone.
   *
   * So the catch-all carries no-cache, and only the content-hashed assets opt out of it.
   * Those are safe to cache forever precisely because their names change when they do.
   */
  headers: [
    {
      glob: '**',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'X-Frame-Options': 'DENY',
        // The one capability this app legitimately asks for is the microphone.
        'Permissions-Policy': 'geolocation=(), camera=(), payment=(), microphone=(self)',
      },
    },
    {
      glob: '/assets/**',
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  ],
  cleanUrls: true,
  trailingSlashBehavior: 'REMOVE',
};

// ------------------------------------------------------------ the deploy

console.log(`\ncreating a version on site "${SITE}"...`);
const version = await api('POST', `/sites/${SITE}/versions`, { config: hostingConfig });
const versionId = version.name.split('/').pop();
console.log(`  ${version.name}`);

console.log('declaring files...');
const populated = await api('POST', `/${version.name}:populateFiles`, {
  files: Object.fromEntries(files.map((f) => [f.urlPath, f.hash])),
});

const required = new Set(populated.uploadRequiredHashes ?? []);
console.log(`  ${required.size} of ${files.length} need uploading (the rest are already stored)`);

let uploaded = 0;
for (const file of files) {
  if (!required.has(file.hash)) continue;
  const res = await fetch(`${populated.uploadUrl}/${file.hash}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/octet-stream',
    },
    body: file.gz,
  });
  if (!res.ok) die(`upload failed for ${file.urlPath}: ${res.status} ${await res.text()}`);
  uploaded++;
  process.stdout.write(`\r  uploaded ${uploaded}/${required.size}`);
}
if (uploaded > 0) process.stdout.write('\n');

console.log('finalizing...');
await api('PATCH', `/${version.name}?update_mask=status`, { status: 'FINALIZED' });

console.log('releasing...');
const release = await api('POST', `/sites/${SITE}/releases?versionName=${version.name}`, {});

console.log(`\ndeployed.`);
console.log(`  version : ${versionId}`);
console.log(`  release : ${release.name?.split('/').pop() ?? '(unnamed)'}`);
console.log(`  url     : https://${SITE}.web.app`);
console.log(`  also at : https://${SITE}.firebaseapp.com`);
