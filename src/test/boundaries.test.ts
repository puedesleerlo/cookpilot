/**
 * The layer rules in openspec/project.md are only real if they fail the build.
 * This lints throwaway sources through the project's own ESLint config and asserts
 * that the violating one is rejected and the clean one is not.
 */
import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import path from 'node:path';

const root = process.cwd();
const eslint = new ESLint({ cwd: root });

const lint = async (relPath: string, code: string) => {
  const [result] = await eslint.lintText(code, { filePath: path.join(root, relPath) });
  return result?.messages ?? [];
};

const messagesFor = (msgs: { ruleId?: string | null; message: string }[], ruleId: string) =>
  msgs.filter((m) => m.ruleId === ruleId);

describe('layer boundaries are enforced by lint', () => {
  it('lets the UI import domain types', async () => {
    const msgs = await lint(
      'src/ui/Probe.tsx',
      `import type { Schedule } from '@/domain';\nexport const x = (s: Schedule) => s.makespanMin;\n`,
    );
    expect(messagesFor(msgs, 'no-restricted-imports')).toHaveLength(0);
  });

  it('stops the UI reaching the scheduler or the model', async () => {
    const msgs = await lint(
      'src/ui/Probe.tsx',
      `import { compile } from '@/scheduler';\nimport { extract } from '@/llm/intake';\nexport const x = () => compile(extract());\n`,
    );
    const restricted = messagesFor(msgs, 'no-restricted-imports');
    expect(restricted.length).toBeGreaterThanOrEqual(2);
    expect(restricted[0]?.message).toContain('@/app');
  });

  it('stops the scheduler importing any other layer', async () => {
    const msgs = await lint(
      'src/scheduler/probe.ts',
      `import { client } from '@/llm/client';\nexport const x = () => client;\n`,
    );
    expect(messagesFor(msgs, 'no-restricted-imports').length).toBeGreaterThan(0);
  });

  it('stops the domain layer depending on anything above it', async () => {
    const msgs = await lint(
      'src/domain/probe.ts',
      `import { compile } from '@/scheduler/compile';\nexport const x = compile;\n`,
    );
    expect(messagesFor(msgs, 'no-restricted-imports').length).toBeGreaterThan(0);
  });

  it('stops the LLM layer from scheduling', async () => {
    const msgs = await lint(
      'src/llm/probe.ts',
      `import { schedule } from '@/scheduler/rcpsp';\nexport const x = schedule;\n`,
    );
    expect(messagesFor(msgs, 'no-restricted-imports')[0]?.message).toContain('never schedule');
  });
});

describe('the scheduler is structurally pure', () => {
  it('rejects an ambient clock read', async () => {
    const msgs = await lint('src/scheduler/probe.ts', `export const now = () => Date.now();\n`);
    const hit = messagesFor(msgs, 'no-restricted-properties');
    expect(hit.length).toBeGreaterThan(0);
    expect(hit[0]?.message).toContain('pass time in as a parameter');
  });

  it('rejects constructing a Date', async () => {
    const msgs = await lint('src/scheduler/probe.ts', `export const now = () => new Date();\n`);
    expect(messagesFor(msgs, 'no-restricted-syntax').length).toBeGreaterThan(0);
  });

  it('rejects ambient randomness and points at the seeded generator', async () => {
    const msgs = await lint('src/scheduler/probe.ts', `export const r = () => Math.random();\n`);
    const hit = messagesFor(msgs, 'no-restricted-properties');
    expect(hit.length).toBeGreaterThan(0);
    expect(hit[0]?.message).toContain('seeded');
  });

  it('rejects I/O', async () => {
    const msgs = await lint(
      'src/scheduler/probe.ts',
      `export const load = () => fetch('/x').then(() => localStorage.getItem('y'));\n`,
    );
    expect(messagesFor(msgs, 'no-restricted-globals').length).toBeGreaterThanOrEqual(2);
  });

  it('leaves pure scheduler code alone', async () => {
    const msgs = await lint(
      'src/scheduler/probe.ts',
      `import type { Task } from '@/domain';\nexport const total = (ts: Task[]) => ts.reduce((n, t) => n + t.durationMin, 0);\n`,
    );
    expect(msgs.filter((m) => m.ruleId?.startsWith('no-restricted'))).toHaveLength(0);
  });
});
