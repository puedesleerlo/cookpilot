// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = process.cwd();
const script = path.join(root, 'scripts/scan-secrets.mjs');

const run = (dir: string) => {
  try {
    return { code: 0, output: execFileSync('node', [script, dir], { encoding: 'utf8' }) };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
};

describe('the scanner scans what can reach the repository', () => {
  it('ignores a credential inside a gitignored file, and catches the same one tracked', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'kc-scan-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: dir });
      writeFileSync(path.join(dir, '.gitignore'), '.env\n');
      mkdirSync(path.join(dir, 'src'), { recursive: true });
      writeFileSync(path.join(dir, 'src', 'a.ts'), 'export const x = 1;\n');
      // scan-secrets-ignore: planted, to prove the gitignored path is skipped
      const key = 'sk-ant-api03-PLANTEDPLANTEDPLANTED';
      writeFileSync(path.join(dir, '.env'), `SECRET_THING=${key}\n`);

      // Gitignored: not a route into the repository, so not a finding.
      expect(run(dir).code).toBe(0);

      // The same value in a file git would track is a finding.
      writeFileSync(path.join(dir, 'src', 'leaked.ts'), `const k = "${key}";\n`);
      const after = run(dir);
      expect(after.code).toBe(1);
      expect(after.output).toContain('leaked.ts');
      expect(after.output).not.toContain('PLANTEDPLANTEDPLANTED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
