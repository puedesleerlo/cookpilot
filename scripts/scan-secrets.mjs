/**
 * Scans the working tree for committed credentials.
 *
 * Pairs with scripts/scan-bundle.mjs: that one guards what ships to the browser, this one
 * guards what reaches the repository. Both report the file and the shape and never the
 * matched value — a CI log that prints the key it found is the second leak.
 *
 * Run: node scripts/scan-secrets.mjs [dir]
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(process.argv[2] ?? '.');

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'coverage', '.pnpm-store', 'build', '.next', '.turbo',
]);

/**
 * Files that legitimately contain key *shapes* as test fixtures or documentation.
 * Each entry is a deliberate exemption, not a blanket one.
 */
const EXEMPT = [
  'scripts/scan-secrets.mjs',
  'scripts/scan-bundle.mjs',
  'apps/api/src/config/redact.ts',
  'packages/domain/src/bundle-scan.test.ts',
  'apps/api/src/config/config.test.ts',
  '.env.example',
];

/**
 * `strict: true` shapes are unmistakable credentials -- a real prefix and a real length --
 * and are scanned everywhere. The rest are heuristics that also match prose describing
 * them, so they are skipped in documentation: DECISIONS.md explaining that the scanner
 * looks for a service-account blob must not trip the scanner looking for one.
 */
const SHAPES = [
  { name: 'Anthropic key', strict: true, re: /sk-ant-[A-Za-z0-9_-]{16,}/ },
  { name: 'Google API key', strict: true, re: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'ElevenLabs key', strict: true, re: /\bsk_[0-9a-f]{32,}\b/ },
  { name: 'OpenAI key', strict: true, re: /\bsk-[A-Za-z0-9]{32,}\b/ },
  { name: 'AWS access key id', strict: true, re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', strict: true, re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'Slack token', strict: true, re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'PEM private key', strict: true, re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'GCP service account key', strict: false, re: /"type"\s*:\s*"service_account"/ },
  { name: 'credentialled database URL', strict: false, re: /\b(postgres(?:ql)?|redis(?:s)?|mongodb(?:\+srv)?):\/\/[^\s:@/]+:[^\s@/'"]{6,}@/ },
  { name: 'assigned secret literal', strict: false, re: /\b(?:API_KEY|SECRET|PASSWORD|TOKEN)\s*[:=]\s*['"][A-Za-z0-9_\-/+]{20,}['"]/ },
];

const TEXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|yaml|yml|env|sh|md|html|css|txt|toml)$/;

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (SKIP_DIRS.has(e.name)) return [];
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : statSync(full).isFile() ? [full] : [];
  });

const findings = [];
let scanned = 0;

/**
 * A .env file on disk is normal and expected; a *tracked* one is the problem. Ask git,
 * not the filesystem -- otherwise every developer with a working local setup fails CI.
 */
const trackedFiles = (() => {
  try {
    return new Set(
      execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean),
    );
  } catch {
    return null; // not a git checkout; fall back to content scanning alone
  }
})();

if (trackedFiles) {
  for (const tracked of trackedFiles) {
    if (/(^|\/)\.env(\.|$)/.test(tracked) && !tracked.endsWith('.env.example')) {
      findings.push({ file: tracked, line: 0, what: 'environment file is tracked by git' });
    }
  }
}

for (const file of walk(ROOT)) {
  if (!TEXT.test(file)) continue;
  const rel = path.relative(ROOT, file);
  if (EXEMPT.includes(rel)) continue;
  scanned++;
  const isDoc = /\.(md|txt)$/.test(file);
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const { name, re, strict } of SHAPES) {
      if (isDoc && !strict) continue;
      const m = re.exec(line);
      if (m) findings.push({ file: rel, line: i + 1, what: `${name} (${m[0].length} chars, redacted)` });
    }
  });
}

const gitignore = existsSync(path.join(ROOT, '.gitignore'))
  ? readFileSync(path.join(ROOT, '.gitignore'), 'utf8')
  : '';
if (!/^\.env\b|^\.env\*/m.test(gitignore)) {
  findings.push({ file: '.gitignore', line: 0, what: '.env is not gitignored' });
}

if (findings.length > 0) {
  console.error(`\nscan-secrets: FAILED — ${findings.length} finding(s)\n`);
  for (const f of findings) {
    console.error(`  ${f.file}${f.line ? `:${f.line}` : ''}\n    ${f.what}`);
  }
  console.error(
    '\nRotate anything real that appears above, then move it to Secret Manager.\n' +
      'If a match is a deliberate test fixture, add the file to EXEMPT in this script.\n',
  );
  process.exit(1);
}

console.log(`scan-secrets: clean — ${scanned} files scanned, no credentials found.`);
