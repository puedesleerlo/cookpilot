/**
 * The package rules in openspec/project.md are only real if they fail the build.
 * This lints throwaway sources through the project's own ESLint config and asserts that
 * the violating ones are rejected and the clean ones are not.
 */
import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const eslint = new ESLint({ cwd: root });

const lint = async (relPath: string, code: string) => {
  const [result] = await eslint.lintText(code, { filePath: path.join(root, relPath) });
  return result?.messages ?? [];
};

const restricted = (msgs: { ruleId?: string | null; message: string }[]) =>
  msgs.filter((m) => m.ruleId?.startsWith('no-restricted'));

describe('package dependencies flow one way', () => {
  it('keeps the domain package a leaf', async () => {
    const msgs = await lint(
      'packages/domain/probe.ts',
      `import { x } from '@kitchen/recipes';\nexport const y = x;\n`,
    );
    expect(restricted(msgs).length).toBeGreaterThan(0);
    expect(restricted(msgs)[0]?.message).toContain('base package');
  });

  it('stops the scheduler importing anything but the domain', async () => {
    const msgs = await lint(
      'packages/scheduler/probe.ts',
      `import { loadSeedPacks } from '@kitchen/recipes';\nexport const x = loadSeedPacks;\n`,
    );
    expect(restricted(msgs)[0]?.message).toContain('@kitchen/domain');
  });

  it('lets the scheduler import the domain', async () => {
    const msgs = await lint(
      'packages/scheduler/probe.ts',
      `import type { Task } from '@kitchen/domain';\nexport const n = (ts: Task[]) => ts.length;\n`,
    );
    expect(restricted(msgs)).toHaveLength(0);
  });

  it('stops any package importing an application', async () => {
    for (const file of ['packages/recipes/probe.ts', 'packages/contracts/probe.ts']) {
      const msgs = await lint(file, `import { app } from '../../apps/api/src/server';\nexport const a = app;\n`);
      expect(restricted(msgs).length, file).toBeGreaterThan(0);
    }
  });
});

describe('the scheduler package stays pure and browser-compilable', () => {
  it('rejects an ambient clock read', async () => {
    const msgs = await lint('packages/scheduler/probe.ts', `export const now = () => Date.now();\n`);
    const hit = msgs.filter((m) => m.ruleId === 'no-restricted-properties');
    expect(hit[0]?.message).toContain('pass time in as a parameter');
  });

  it('rejects constructing a Date', async () => {
    const msgs = await lint('packages/scheduler/probe.ts', `export const d = () => new Date();\n`);
    expect(msgs.filter((m) => m.ruleId === 'no-restricted-syntax').length).toBeGreaterThan(0);
  });

  it('rejects ambient randomness', async () => {
    const msgs = await lint('packages/scheduler/probe.ts', `export const r = () => Math.random();\n`);
    expect(msgs.filter((m) => m.ruleId === 'no-restricted-properties')[0]?.message).toContain('seeded');
  });

  it('rejects I/O', async () => {
    const msgs = await lint(
      'packages/scheduler/probe.ts',
      `export const load = () => fetch('/x').then(() => localStorage.getItem('y'));\n`,
    );
    expect(msgs.filter((m) => m.ruleId === 'no-restricted-globals').length).toBeGreaterThanOrEqual(2);
  });

  it('rejects Node built-ins, because it is compiled for the browser too', async () => {
    const msgs = await lint(
      'packages/scheduler/probe.ts',
      `import { readFileSync } from 'node:fs';\nexport const x = readFileSync;\n`,
    );
    expect(restricted(msgs)[0]?.message).toContain('browser');
  });
});

describe('server-only code cannot reach the client bundle', () => {
  it('stops the web app importing the API', async () => {
    const msgs = await lint(
      'apps/web/src/probe.ts',
      `import { server } from '../../api/src/server';\nexport const s = server;\n`,
    );
    expect(restricted(msgs)[0]?.message).toContain('@kitchen/contracts');
  });

  it('stops the web app importing a database or queue client', async () => {
    for (const dep of ['drizzle-orm', 'bullmq', 'ioredis', 'fastify', '@google-cloud/secret-manager']) {
      const msgs = await lint('apps/web/src/probe.ts', `import x from '${dep}';\nexport const y = x;\n`);
      expect(restricted(msgs).length, dep).toBeGreaterThan(0);
    }
  });

  it('lets the web app import the shared packages it is supposed to', async () => {
    const msgs = await lint(
      'apps/web/src/probe.ts',
      `import type { Schedule } from '@kitchen/domain';\nimport { API_VERSION } from '@kitchen/contracts';\nimport { SCHEDULER_VERSION } from '@kitchen/scheduler';\nexport const x = (s: Schedule) => [s.makespanMin, API_VERSION, SCHEDULER_VERSION];\n`,
    );
    expect(restricted(msgs)).toHaveLength(0);
  });

  it('stops a server application importing the web client', async () => {
    const msgs = await lint(
      'apps/api/src/probe.ts',
      `import { App } from '@kitchen/web';\nexport const a = App;\n`,
    );
    expect(restricted(msgs).length).toBeGreaterThan(0);
  });
});

describe('no free-text slot extractor exists', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.name === 'node_modules' || e.name === 'dist') return [];
      return e.isDirectory() ? walk(full) : statSync(full).isFile() ? [full] : [];
    });

  it('has no module that derives constraints from prose without a model', () => {
    const offenders: string[] = [];
    for (const base of ['packages', 'apps']) {
      for (const file of walk(path.join(root, base))) {
        if (!/\.tsx?$/.test(file) || /\.test\.tsx?$/.test(file)) continue;
        const src = readFileSync(file, 'utf8');
        // The deleted parser's signatures. A lexicon *lookup* is fine; deriving a slot
        // from free text with regexes is what the delta removed.
        if (/parseIntakeDeterministically|extractIntakeOffline|parseCount\s*\(|URGENT_CUES|RESTRICTION_CUES|STYLE_CUES|EQUIPMENT_CUES/.test(src)) {
          offenders.push(path.relative(root, file));
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the lexicon, because a dictionary lookup is a different thing', async () => {
    const { resolveIngredient } = await import('./lexicon');
    expect(resolveIngredient('scallions').canonicalName).toBe('spring onions');
    expect(resolveIngredient('yu choy').unrecognised).toBe(true);
  });
});
