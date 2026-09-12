/**
 * A scanner that has never failed is a scanner nobody has tested. These plant each
 * forbidden shape in a throwaway bundle and assert the script rejects it.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = process.cwd();
const script = path.join(root, 'scripts/scan-bundle.mjs');
const made: string[] = [];

const bundleWith = (filename: string, content: string): string => {
  const dir = mkdtempSync(path.join(tmpdir(), 'kc-bundle-'));
  made.push(dir);
  mkdirSync(path.join(dir, 'assets'), { recursive: true });
  writeFileSync(path.join(dir, 'assets', filename), content);
  return dir;
};

const run = (dir: string): { code: number; output: string } => {
  try {
    const out = execFileSync('node', [script, dir], { encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, output: out };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
};

afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('the bundle scanner', () => {
  it('passes a clean bundle', () => {
    const { code, output } = run(bundleWith('index.js', 'export const a=1;const url="/v1/sessions";'));
    expect(code).toBe(0);
    expect(output).toContain('clean');
  });

  it.each([
    ['a secret name', 'index.js', 'const k=import.meta.env.BRAVE_API_KEY;'],
    ['an Anthropic key shape', 'index.js', 'const k="sk-ant-api03-AAAABBBBCCCCDDDDEEEE";'],
    ['a Google API key shape', 'index.js', 'const k="AIzaSyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";'],
    ['an ElevenLabs key shape', 'index.js', 'const k="sk_0123456789abcdef0123456789abcdef";'],
    ['a Postgres URL with credentials', 'index.js', 'const u="postgresql://user:hunter2@db.example/app";'],
    ['a service-account key', 'config.json', '{"type":"service_account","project_id":"x"}'],
    ['a PEM private key', 'index.js', '"-----BEGIN RSA PRIVATE KEY-----"'],
  ])('rejects %s', (_label, file, content) => {
    const { code, output } = run(bundleWith(file, content));
    expect(code).toBe(1);
    expect(output).toContain('FAILED');
  });

  it('reports the shape without printing the value', () => {
    const { output } = run(bundleWith('index.js', 'const k="sk-ant-api03-SECRETSECRETSECRET";'));
    expect(output).toContain('redacted');
    expect(output).not.toContain('SECRETSECRETSECRET');
  });

  it('fails loudly when there is no bundle to scan', () => {
    const { code, output } = run(path.join(tmpdir(), 'kc-does-not-exist'));
    expect(code).toBe(2);
    expect(output).toContain('does not exist');
  });
});
