// @vitest-environment node
/**
 * The real chain: real transcripts, real Gemini, real Brave, real recipe pages.
 *
 * Opt-in with `LIVE_PIPELINE=1`, because it spends money and fetches other people's pages.
 * It is the only test that can tell you the product works — everything else proves that
 * the parts fit together, and this proves they do the job.
 *
 *   LIVE_PIPELINE=1 npx vitest run apps/api/src/pipeline/pipeline.live
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createGateway } from '../llm/gateway';
import { vertexGeneratorFrom } from '../llm/vertex';
import { runPipeline } from './run';

/** The repo's own .env, so a live run needs no shell ceremony. Never committed. */
const loadEnv = (): Record<string, string | undefined> => {
  const env: Record<string, string | undefined> = { ...process.env };
  try {
    const text = readFileSync(path.join(process.cwd(), '.env'), 'utf8');
    for (const line of text.split('\n')) {
      const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      const value = match[2]!.trim().replace(/^["']|["']$/g, '');
      env[match[1]!] ??= value;
    }
  } catch {
    // No .env. The guards below will skip.
  }
  return env;
};

const env = loadEnv();
/** A live run you can read afterwards; vitest swallows console output in this project. */
const REPORT = process.env['PIPELINE_REPORT'] ?? '/tmp/pipeline-live.txt';
const LIVE = process.env['LIVE_PIPELINE'] === '1';

const liveIt = (name: string, fn: () => Promise<void>, timeout = 300_000) =>
  it(
    name,
    async () => {
      if (!LIVE) return;
      await fn();
    },
    timeout,
  );

/** What someone would actually say, warts included. */
const WANTS =
  "I want to do a proper batch cook this week, something with chicken, maybe a stir fry, " +
  "and I'd like one thing I can just reheat for lunch. Nothing too spicy.";
const PANTRY =
  "So I've got chicken breasts, a big bag of rice, some bok choy that's honestly on its last " +
  "legs, peppers, garlic, ginger, soy sauce, sesame oil and a couple of lemons. There's two of us cooking.";

describe('the pipeline, for real', () => {
  liveIt('turns two spoken answers into scaled recipes from the open web', async () => {
    const generate = vertexGeneratorFrom(env);
    expect(generate, 'GOOGLE_CLOUD_PROJECT must be set').not.toBeNull();

    const braveKey = env['BRAVE_API_KEY'];
    expect(braveKey, 'BRAVE_API_KEY must be set').toBeTruthy();

    const gateway = createGateway({ generate, env, timeoutMs: 45_000 });
    const result = await runPipeline({
      gateway,
      brave: { available: true, apiKey: braveKey!, endpoint: 'https://api.search.brave.com/res/v1/web/search' },
      wantsTranscript: WANTS,
      pantryTranscript: PANTRY,
      wantRecipes: 4,
    });

    const out: string[] = [];
    const say = (...parts: unknown[]): void => { out.push(parts.map(String).join(' ')); };
    const report = () => writeFileSync(REPORT, out.join('\n'));

    say('--- INTAKE ---');
    say('wants  :', result.intake.wants.join(' | '));
    say('pantry :', result.intake.pantry.map((p) => `${p.said}${p.urgency ? ` [${p.urgency}]` : ''}`).join(', '));
    say('cooks  :', result.intake.cookCount, '-> target', result.portionTarget, 'portions');
    say('\n--- QUERIES ---');
    for (const q of result.queries) say(' ', q);
    say('\n--- RECIPES ---');
    for (const r of result.recipes) {
      say(`\n${r.title}  (${r.kind}, serves ${r.yieldServings}, keeps ${r.keepsDays}d)`);
      say(`  ${r.source?.siteName} ${r.source?.url}`);
      for (const s of r.steps) {
        say(
          `   ${s.durationMin}m (${s.activeMin}+${s.finishMin} hands) ${s.taskClass.padEnd(12)} ${s.text}`,
        );
      }
    }
    say('\n--- CORRECTIONS ---');
    for (const c of result.corrections) say(' ', c);
    say('\n--- NOTES ---');
    for (const n of result.notes) say(` [${n.stage}] ${n.message}`);

    report();

    // It heard the answers.
    expect(result.intake.cookCount).toBe(2);
    expect(result.intake.pantry.length).toBeGreaterThanOrEqual(5);
    const said = result.intake.pantry.map((p) => p.said.toLowerCase()).join(' ');
    expect(said).toContain('chicken');
    expect(said).toContain('bok choy');
    // "on its last legs" is the whole reason urgency is a model's job and not a regex's.
    expect(result.intake.pantry.some((p) => p.urgency === 'use-today')).toBe(true);

    // It searched for something sensible.
    expect(result.queries.length).toBeGreaterThan(1);

    // It came back with real recipes from real pages.
    expect(result.recipes.length).toBeGreaterThanOrEqual(2);
    for (const recipe of result.recipes) {
      expect(recipe.source?.url, recipe.title).toMatch(/^https?:\/\//);
      expect(recipe.steps.length, recipe.title).toBeGreaterThan(1);
      // Scaled to this session, not left at whatever the page said.
      expect(recipe.yieldServings, recipe.title).toBeGreaterThanOrEqual(3);
      // The gap between duration and hands-on is what the scheduler spends.
      for (const step of recipe.steps) {
        expect(step.activeMin + step.finishMin, `${recipe.title}: ${step.text}`)
          .toBeLessThanOrEqual(step.durationMin);
      }
    }

    /*
     * Unattended time is checked across the session, not per dish.
     *
     * A stir-fry really is all hands-on — you stand at the wok stirring — and a first
     * version of this test failed on a faithful extraction of one. What has to be true is
     * that the session as a whole has gaps in it, because gaps are the only thing the
     * scheduler can overlap. A week of meals where every minute needs a hand is either a
     * misread or a session nobody should be told fits in an hour.
     */
    const unattended = result.recipes
      .flatMap((r) => r.steps)
      .reduce((n, s) => n + (s.durationMin - s.activeMin - s.finishMin), 0);
    expect(unattended, 'nothing in this whole session can be walked away from').toBeGreaterThan(5);
  });
});
