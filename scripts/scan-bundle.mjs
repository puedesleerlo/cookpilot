/**
 * Fails the build if a provider secret reaches the client bundle.
 *
 * This is the last line of a defence that starts with the lint rules and ends here. Lint
 * catches an import; this catches a value — an inlined `import.meta.env` substitution, a
 * hardcoded key, a secret that arrived through a transitive dependency's config.
 *
 * Run: node scripts/scan-bundle.mjs [bundleDir]
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const BUNDLE_DIR = process.argv[2] ?? 'apps/web/dist';

/**
 * Secret NAMES that must never appear in the client, and value SHAPES that must never
 * appear whatever they are called. Gemini contributes nothing here: Vertex authenticates
 * through the Cloud Run service account, so there is no model key to leak.
 */
const FORBIDDEN_NAMES = [
  'BRAVE_API_KEY',
  'ELEVENLABS_API_KEY',
  'SPOONACULAR_API_KEY',
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'SENTRY_DSN_SERVER',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'ANTHROPIC_API_KEY',
];

const FORBIDDEN_SHAPES = [
  { name: 'Anthropic key', re: /sk-ant-[A-Za-z0-9_-]{16,}/ },
  { name: 'Google API key', re: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'ElevenLabs key', re: /\bsk_[0-9a-f]{32,}\b/ },
  { name: 'Postgres URL with credentials', re: /postgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]+@/ },
  { name: 'Redis URL with credentials', re: /redis(?:s)?:\/\/[^\s:@/]+:[^\s@/]+@/ },
  { name: 'GCP service account key', re: /"type"\s*:\s*"service_account"/ },
  { name: 'PEM private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : statSync(full).isFile() ? [full] : [];
  });

if (!existsSync(BUNDLE_DIR)) {
  console.error(`scan-bundle: ${BUNDLE_DIR} does not exist. Build the client first.`);
  process.exit(2);
}

const TEXT = /\.(js|mjs|cjs|css|html|json|map|txt)$/;
const findings = [];
let scanned = 0;

for (const file of walk(BUNDLE_DIR)) {
  if (!TEXT.test(file)) continue;
  scanned++;
  const content = readFileSync(file, 'utf8');
  const rel = path.relative(process.cwd(), file);

  for (const name of FORBIDDEN_NAMES) {
    if (content.includes(name)) {
      findings.push({ file: rel, what: `secret name "${name}"` });
    }
  }
  for (const { name, re } of FORBIDDEN_SHAPES) {
    const m = re.exec(content);
    if (m) {
      // Report the shape, never the value.
      findings.push({ file: rel, what: `${name} (${m[0].length} chars, redacted)` });
    }
  }
}

if (findings.length > 0) {
  console.error(`\nscan-bundle: FAILED — ${findings.length} finding(s) in ${BUNDLE_DIR}\n`);
  for (const f of findings) console.error(`  ${f.file}\n    ${f.what}`);
  console.error(
    '\nNothing secret may ship to the browser. Move the call behind the API, and have the\n' +
      'client request a short-lived token instead of holding a provider key.\n',
  );
  process.exit(1);
}

console.log(`scan-bundle: clean — ${scanned} files in ${BUNDLE_DIR}, no secret names or key shapes found.`);
