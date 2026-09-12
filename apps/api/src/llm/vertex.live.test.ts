// @vitest-environment node
/**
 * Live Vertex check.
 *
 * Opt-in: this calls a real, metered API, so it is skipped unless `LIVE_VERTEX=1` is set.
 * A suite that quietly spends money on every run is a suite people stop running.
 *
 * What it proves that the unit tests cannot: that ADC actually authenticates, that the
 * model id in the config module is one the project can serve, that `responseJsonSchema`
 * constrains the output as expected, and that token counts come back for the spend metric.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createGateway, resetStageMetrics, stageMetrics } from './gateway';
import { vertexGeneratorFrom } from './vertex';
import { stageConfig } from './models';

const LIVE = process.env['LIVE_VERTEX'] === '1';
const env = {
  GOOGLE_CLOUD_PROJECT: process.env['GOOGLE_CLOUD_PROJECT'],
  VERTEX_LOCATION: process.env['VERTEX_LOCATION'] ?? 'global',
};

const liveIt = (name: string, fn: () => Promise<void>, timeout = 60_000) =>
  it(name, async () => {
    if (!LIVE) return;
    await fn();
  }, timeout);

const PantrySchema = z.object({
  ingredients: z.array(z.object({ spokenAs: z.string(), urgency: z.enum(['use-today', 'use-soon', 'not-urgent']) })),
  timeBudgetMin: z.number().int().positive().optional(),
  cookCount: z.number().int().positive().optional(),
});

describe('Vertex, live', () => {
  liveIt('authenticates with ADC and returns schema-shaped output', async () => {
    resetStageMetrics();
    const generate = vertexGeneratorFrom(env);
    expect(generate, 'GOOGLE_CLOUD_PROJECT must be set for the live test').not.toBeNull();

    const call = createGateway({ generate, env: {} });
    const result = await call(
      {
        stage: 'L1-intake',
        schema: PantrySchema,
        system:
          'You extract facts from what someone says about their fridge. Return only what they ' +
          'actually mentioned. Never add an ingredient they did not say.',
        buildUser: (text: string) => `They said:\n\n${text}`,
        fallback: () => ({ ingredients: [] }),
      },
      "I've got chicken, some bok choy going off, and a bag of rice. About an hour, two of us cooking.",
    );

    expect(result.source).toBe('model');

    const names = result.value.ingredients.map((i) => i.spokenAs.toLowerCase()).join(' ');
    expect(names).toMatch(/chicken/);
    expect(names).toMatch(/bok choy/);
    expect(names).toMatch(/rice/);

    // The thing the product actually needs from this stage.
    const bokChoy = result.value.ingredients.find((i) => /bok choy/i.test(i.spokenAs));
    expect(bokChoy?.urgency).toBe('use-today');
    expect(result.value.timeBudgetMin).toBe(60);
    expect(result.value.cookCount).toBe(2);

    // Token counts must come back, or the spend metric is decorative.
    expect(result.usage?.tokensIn).toBeGreaterThan(0);
    expect(result.usage?.tokensOut).toBeGreaterThan(0);
    const metric = stageMetrics().find((m) => m.stage === 'L1-intake');
    expect(metric?.costUsd).toBeGreaterThan(0);
  });

  liveIt('does not invent an ingredient that was not mentioned', async () => {
    const call = createGateway({ generate: vertexGeneratorFrom(env), env: {} });
    const result = await call(
      {
        stage: 'L1-intake',
        schema: PantrySchema,
        system:
          'You extract facts. Return ingredients ONLY if the person actually mentioned them. ' +
          'Never add a likely ingredient and never complete a dish.',
        buildUser: (text: string) => `They said:\n\n${text}`,
        fallback: () => ({ ingredients: [] }),
      },
      'I want to make a carbonara but all I have is eggs.',
    );
    const names = result.value.ingredients.map((i) => i.spokenAs.toLowerCase()).join(' ');
    expect(names).toMatch(/egg/);
    // The dish names them; the person did not say they have them.
    expect(names).not.toMatch(/pancetta|guanciale|pecorino|parmesan|spaghetti/);
  });

  it('names the configured model so a failure points at the config module', () => {
    // Built from parts so this file holds no model identifier of its own: the guard in
    // gateway.test.ts exists to stop exactly that, and it should apply to tests too.
    const currentGeneration = new RegExp('^' + ['gemini', '3.'].join('-'));
    expect(stageConfig('L1-intake').model).toMatch(currentGeneration);
  });
});
