// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  SECRETS,
  PUBLIC_CLIENT_CONFIG,
  requiredFor,
  secretsFor,
} from './secrets';
import {
  SecretError,
  checkReference,
  describeMissing,
  envResolver,
  loadSecrets,
  requireSecrets,
} from './loader';
import { REDACTION, clearRegisteredSecrets, redact, redactDeep, registerSecretValue } from './redact';

const root = process.cwd();

beforeEach(() => clearRegisteredSecrets());
afterEach(() => clearRegisteredSecrets());

describe('the secret inventory', () => {
  it('agrees with .env.example', () => {
    const example = readFileSync(path.join(root, '.env.example'), 'utf8');
    const declared = new Set<string>(SECRETS.map((s) => s.name));
    const inExample = new Set(
      example
        .split('\n')
        .map((l) => /^([A-Z][A-Z0-9_]*)=/.exec(l)?.[1])
        .filter((n): n is string => Boolean(n)),
    );
    for (const name of declared) expect(inExample.has(name), `${name} missing from .env.example`).toBe(true);
    // Everything extra in the example must be deliberately-public client config.
    const extras = [...inExample].filter(
      (n) => !declared.has(n) && !(PUBLIC_CLIENT_CONFIG as readonly string[]).includes(n),
    );
    expect(extras.filter((n) => !['GOOGLE_CLOUD_PROJECT', 'VERTEX_LOCATION'].includes(n))).toEqual([]);
  });

  it('contains no model provider secret, because Vertex uses the service account', () => {
    const modelish = SECRETS.filter((s) => /vertex|gemini|google_?api|anthropic|openai|model/i.test(s.name));
    expect(modelish).toEqual([]);
  });

  /**
   * Two files may be tracked, and only two.
   *
   * `.env.example` documents the inventory and holds no values. `.env.production` pins the
   * deployed API URL, which is not a secret — it is a public address the browser is about
   * to request — and which has to be committed, because a build that silently loses it
   * falls back to the page's own origin and ships an app that looks perfect and fails on
   * its first request.
   *
   * The exception defends itself: every name in `.env.production` must be `VITE_`-
   * prefixed, so it cannot become a place a server secret is smuggled into git.
   */
  const TRACKABLE_ENV_FILES = ['.env.example', '.env.production'];

  it('keeps .env out of git', () => {
    const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n');
    const envFiles = tracked.filter((f) => /(^|\/)\.env(\.|$)/.test(f));
    expect(envFiles.filter((f) => !TRACKABLE_ENV_FILES.some((ok) => f.endsWith(ok)))).toEqual([]);
    expect(readFileSync(path.join(root, '.gitignore'), 'utf8')).toMatch(/^\.env/m);
  });

  it('lets nothing but public client config into the tracked production env', () => {
    const names = readFileSync(path.join(root, '.env.production'), 'utf8')
      .split('\n')
      .map((line) => /^\s*([A-Z][A-Z0-9_]*)\s*=/.exec(line)?.[1])
      .filter((name): name is string => Boolean(name));

    expect(names.length).toBeGreaterThan(0);
    // `VITE_` is the only prefix Vite exposes to the browser, so it is the only prefix that
    // belongs in a file anyone can read on GitHub.
    expect(names.filter((name) => !name.startsWith('VITE_'))).toEqual([]);
    for (const declared of SECRETS) expect(names).not.toContain(declared.name);
  });

  it('does not let the worker read the voice key', () => {
    const workerSecrets = secretsFor('worker').map((s) => s.name);
    expect(workerSecrets).not.toContain('ELEVENLABS_API_KEY');
    expect(workerSecrets).not.toContain('BRAVE_API_KEY');
    expect(workerSecrets).toContain('DATABASE_URL');
  });
});

describe('version pinning', () => {
  it('accepts an explicit version', () => {
    expect(() => checkReference('BRAVE_API_KEY', 'projects/p/secrets/BRAVE_API_KEY/versions/7')).not.toThrow();
  });

  it('rejects latest, and says why', () => {
    expect(() => checkReference('BRAVE_API_KEY', 'projects/p/secrets/BRAVE_API_KEY/versions/latest')).toThrow(
      /deliberate deploy/,
    );
  });

  it('rejects a malformed Secret Manager reference', () => {
    expect(() => checkReference('BRAVE_API_KEY', 'projects/p/secrets/BRAVE_API_KEY')).toThrow(SecretError);
  });

  it('leaves an ordinary value alone', () => {
    expect(() => checkReference('JWT_SECRET', 'a-perfectly-ordinary-value')).not.toThrow();
  });
});

describe('loading', () => {
  const env = (over: Record<string, string> = {}) => ({
    DATABASE_URL: 'postgresql://u:p@localhost/kc',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'abcdefghijklmnopqrstuvwxyz012345',
    ...over,
  });

  it('loads the declared set and reports nothing missing', async () => {
    const { store, missing } = await loadSecrets('api', envResolver(env()));
    expect(missing).toEqual([]);
    expect(store.get('JWT_SECRET')).toBe('abcdefghijklmnopqrstuvwxyz012345');
  });

  it('reports a missing required secret rather than starting', async () => {
    const withoutJwt = env();
    delete (withoutJwt as Record<string, string | undefined>)['JWT_SECRET'];
    const { missing } = await loadSecrets('api', envResolver(withoutJwt));
    expect(missing.map((m) => m.name)).toEqual(['JWT_SECRET']);
  });

  it('names the missing secret and where to get it', async () => {
    const message = describeMissing('api', [...requiredFor('api')].slice(0, 1));
    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('Get it from:');
    expect(message).toContain('.env.example');
  });

  it('exits rather than opening a listener', async () => {
    const withoutDb = env();
    delete (withoutDb as Record<string, string | undefined>)['DATABASE_URL'];
    let fatal = '';
    await expect(
      requireSecrets('api', envResolver(withoutDb), ((m: string) => {
        fatal = m;
        throw new Error('exit');
      }) as (m: string) => never),
    ).rejects.toThrow('exit');
    expect(fatal).toContain('DATABASE_URL');
  });

  it('survives a missing optional secret', async () => {
    const { store, missing } = await loadSecrets('api', envResolver(env()));
    expect(missing).toEqual([]);
    expect(store.optional('BRAVE_API_KEY')).toBeUndefined();
    expect(store.has('BRAVE_API_KEY')).toBe(false);
  });

  it('throws when a service reads a secret it did not declare', async () => {
    const { store } = await loadSecrets('worker', envResolver(env()));
    expect(() => store.get('ELEVENLABS_API_KEY')).toThrow(/does not declare/);
  });

  it('throws for a secret that is not in the inventory at all', async () => {
    const { store } = await loadSecrets('api', envResolver(env()));
    expect(() => store.get('MYSTERY_KEY')).toThrow(/not in the secret inventory/);
  });

  it('refuses a latest reference at load time', async () => {
    await expect(
      loadSecrets('api', envResolver(env({ BRAVE_API_KEY: 'projects/p/secrets/BRAVE_API_KEY/versions/latest' }))),
    ).rejects.toThrow(/latest/);
  });
});

describe('redaction', () => {
  it('redacts a registered value whatever field it is logged under', () => {
    registerSecretValue('super-secret-value-1234');
    const out = redactDeep({ harmlessLookingField: 'super-secret-value-1234' }) as Record<string, string>;
    expect(out['harmlessLookingField']).toBe(REDACTION);
  });

  it('redacts by shape even when the value was never registered', () => {
    // scan-secrets-ignore: synthetic key, the fixture this test exists to redact
    const synthetic = 'sk-ant-api03-BBBBCCCCDDDDEEEE';
    expect(redact(`key is ${synthetic} here`)).toContain(REDACTION);
    expect(redact(`key is ${synthetic} here`)).not.toContain('BBBBCCCCDDDDEEEE');
  });

  it('redacts inside free text, not only in fields', () => {
    registerSecretValue('hunter2-hunter2-hunter2');
    expect(redact('connection failed using hunter2-hunter2-hunter2 as the password')).toContain(REDACTION);
  });

  it('keeps a database host readable while hiding the credentials', () => {
    // scan-secrets-ignore: synthetic connection string
    const out = redact('failed to reach postgresql://kc:s3cretpass@db.internal:5432/kc');
    expect(out).not.toContain('s3cretpass');
    expect(out).toContain('db.internal');
  });

  it('redacts inside errors and nested structures', () => {
    registerSecretValue('nested-secret-value-xyz');
    const out = redactDeep({ a: [{ b: new Error('failed with nested-secret-value-xyz') }] }) as {
      a: { b: { message: string } }[];
    };
    expect(out.a[0]!.b.message).toContain(REDACTION);
  });

  it('does not redact ordinary short strings', () => {
    registerSecretValue('short');
    expect(redact('this short line is fine')).toBe('this short line is fine');
  });
});

describe('one module per provider', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      if (e.name === 'node_modules' || e.name === 'dist') return [];
      const full = path.join(dir, e.name);
      return e.isDirectory() ? walk(full) : [full];
    });

  const readers = (secret: string): string[] =>
    ['apps', 'packages']
      .flatMap((d) => walk(path.join(root, d)))
      .filter((f) => /\.tsx?$/.test(f) && readFileSync(f, 'utf8').includes(secret))
      .map((f) => path.relative(root, f))
      // The inventory declares them and tests exercise them; neither is a *reader*.
      .filter((f) => !/config\/(secrets|loader|redact)\.ts$|\.test\.tsx?$/.test(f))
      .sort();

  it.each([
    ['BRAVE_API_KEY', 'apps/api/src/providers/brave.ts'],
    ['ELEVENLABS_API_KEY', 'apps/api/src/providers/elevenlabs.ts'],
  ])('%s is read in exactly one module', (secret, expected) => {
    expect(readers(secret)).toEqual([expected]);
  });

  it('the Vertex provider reads no credential at all', () => {
    const src = readFileSync(path.join(root, 'apps/api/src/providers/vertex.ts'), 'utf8');
    expect(src).not.toMatch(/store\.(get|optional)\(/);
    expect(src).toMatch(/Application Default Credentials/);
  });
});

describe('the IAM script matches the declarations', () => {
  const iam = readFileSync(path.join(root, 'infra/iam.sh'), 'utf8');

  it.each(SECRETS.map((s) => [s.name, s.services] as const))(
    'binds %s to exactly its declared services',
    (name, services) => {
      for (const service of ['api', 'worker'] as const) {
        const bound = new RegExp(
          `add-iam-policy-binding ${name}[\\s\\S]{0,200}?SA_${service.toUpperCase()}\\b`,
        ).test(iam);
        expect(bound, `${name} -> ${service}`).toBe((services as readonly string[]).includes(service));
      }
    },
  );

  it('never mounts a secret at :latest', () => {
    expect(iam).not.toMatch(/versions\/latest|:latest/);
  });

  it('grants Vertex by role rather than by secret', () => {
    expect(iam).toMatch(/roles\/aiplatform\.user/);
  });
});

describe('the secret scanner', () => {
  const made: string[] = [];
  afterEach(() => {
    for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  const treeWith = (file: string, content: string): string => {
    const dir = mkdtempSync(path.join(tmpdir(), 'kc-tree-'));
    made.push(dir);
    mkdirSync(path.join(dir, 'src'), { recursive: true });
    writeFileSync(path.join(dir, '.gitignore'), '.env\n');
    writeFileSync(path.join(dir, 'src', file), content);
    return dir;
  };

  const run = (dir: string) => {
    try {
      return { code: 0, output: execFileSync('node', [path.join(root, 'scripts/scan-secrets.mjs'), dir], { encoding: 'utf8' }) };
    } catch (err) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      return { code: e.status ?? 1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
    }
  };

  it('passes a clean tree', () => {
    expect(run(treeWith('a.ts', 'export const x = 1;')).code).toBe(0);
  });

  it('catches a planted credential without printing it', () => {
    // scan-secrets-ignore: planted on purpose, to prove the scanner catches it
    const { code, output } = run(treeWith('a.ts', `const k = "sk-ant-api03-PLANTEDPLANTEDPLANTED";`));
    expect(code).toBe(1);
    expect(output).toContain('FAILED');
    expect(output).toContain('redacted');
    expect(output).not.toContain('PLANTEDPLANTEDPLANTED');
  });

  it('catches a credentialled database URL', () => {
    // scan-secrets-ignore: planted on purpose, to prove the scanner catches it
    expect(run(treeWith('a.ts', `const u = "postgresql://kc:realpassword@db/kc";`)).code).toBe(1);
  });

  it('fails when .env is not gitignored', () => {
    const dir = treeWith('a.ts', 'export const x = 1;');
    writeFileSync(path.join(dir, '.gitignore'), 'node_modules\n');
    const { code, output } = run(dir);
    expect(code).toBe(1);
    expect(output).toContain('not gitignored');
  });
});
