import { z } from 'zod';
import { contentHash } from '@kitchen/domain';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { llmCache } from '../db/schema';
import { estimateCost, isStage, stageConfig, type Stage } from './models';
import { recordStageRun } from './debug';

/**
 * The single boundary between Kitchen Compiler and Gemini.
 *
 * Four properties are structural here rather than a discipline each stage remembers:
 *
 *   1. A stage cannot skip its fallback, because the stage never calls the provider — the
 *      gateway does, and the gateway decides whether a provider is available.
 *   2. Nothing leaves this file unvalidated. Constrained decoding shapes the JSON;
 *      Zod decides whether it means anything.
 *   3. The client names a stage. It cannot pass a prompt through, because the prompt is
 *      built here from the stage definition and the validated input.
 *   4. The model never makes a scheduling decision. `apps/api` may import the scheduler,
 *      but nothing in this file does.
 */

export type StageSource = 'model' | 'repaired' | 'cache' | 'fixture' | 'fallback';

export type StageResult<T> = {
  value: T;
  source: StageSource;
  /** Populated when the fallback ran, so callers can surface degraded quality honestly. */
  reason?: string;
  usage?: { tokensIn: number; tokensOut: number; costUsd: number };
};

export type StageSpec<TIn, TOut> = {
  stage: Stage;
  schema: z.ZodType<TOut>;
  system: string;
  buildUser: (input: TIn) => string;
  /** Always present. This is what makes the no-provider path a guarantee, not a hope. */
  fallback: (input: TIn, reason: string) => TOut;
  /** Recorded response for the demo scenario, keyed by input hash. */
  fixtures?: Record<string, unknown>;
};

export type GenerateRequest = {
  model: string;
  system: string;
  user: string;
  responseSchema: unknown;
  temperature: number;
  maxOutputTokens: number;
  location: string;
  signal: AbortSignal;
};

export type GenerateResult = {
  text: string;
  tokensIn: number;
  tokensOut: number;
};

/** Injected so tests drive the gateway without a network, a project or credentials. */
export type Generator = (req: GenerateRequest) => Promise<GenerateResult>;

export type GatewayOptions = {
  generate: Generator | null;
  db?: Database;
  demoMode?: boolean;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
  now?: () => number;
};

export const DEFAULT_TIMEOUT_MS = 30_000;

// ------------------------------------------------------------ cost accounting

export type StageMetric = {
  stage: Stage;
  calls: number;
  cacheHits: number;
  fixtureHits: number;
  fallbacks: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
};

const metrics = new Map<Stage, StageMetric>();

const bump = (stage: Stage, patch: Partial<StageMetric>): void => {
  const current = metrics.get(stage) ?? {
    stage,
    calls: 0,
    cacheHits: 0,
    fixtureHits: 0,
    fallbacks: 0,
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
  };
  metrics.set(stage, {
    ...current,
    calls: current.calls + (patch.calls ?? 0),
    cacheHits: current.cacheHits + (patch.cacheHits ?? 0),
    fixtureHits: current.fixtureHits + (patch.fixtureHits ?? 0),
    fallbacks: current.fallbacks + (patch.fallbacks ?? 0),
    tokensIn: current.tokensIn + (patch.tokensIn ?? 0),
    tokensOut: current.tokensOut + (patch.tokensOut ?? 0),
    costUsd: current.costUsd + (patch.costUsd ?? 0),
  });
};

export const stageMetrics = (): StageMetric[] => [...metrics.values()];
export const resetStageMetrics = (): void => metrics.clear();
export const totalSpendUsd = (): number =>
  [...metrics.values()].reduce((n, m) => n + m.costUsd, 0);

// ------------------------------------------------------------------- helpers

const extractJson = (raw: string): unknown => {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  return JSON.parse((fenced?.[1] ?? raw).trim());
};

const issuesOf = (err: z.ZodError): string[] =>
  err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);

/**
 * The cache key. A hash of the stage, the model and the input — so a model change
 * invalidates the cache, which is what you want when the whole point of changing model was
 * to get different output.
 *
 * The key is a hash rather than the input, so the cache table never holds a readable
 * pantry or transcript.
 */
export const cacheKeyFor = (stage: Stage, model: string, input: unknown): string =>
  contentHash({ stage, model, input });

// ------------------------------------------------------------------ gateway

export const createGateway = (options: GatewayOptions) => {
  const { generate, db, demoMode = false, env = {}, timeoutMs = DEFAULT_TIMEOUT_MS, now = () => Date.now() } = options;

  return async function callStage<TIn, TOut>(
    spec: StageSpec<TIn, TOut>,
    input: TIn,
  ): Promise<StageResult<TOut>> {
    // The stage allowlist. A caller cannot name something that is not a stage, and cannot
    // supply prompt text — `buildUser` is what constructs the prompt.
    if (!isStage(spec.stage)) {
      throw new Error(`unknown stage: ${String(spec.stage)}`);
    }

    const startedAt = now();
    const config = stageConfig(spec.stage, env);
    const key = cacheKeyFor(spec.stage, config.model, input);
    const user = spec.buildUser(input);

    const finish = (
      value: TOut,
      source: StageSource,
      extra: { repairs?: number; response?: string; issues?: string[]; reason?: string; usage?: StageResult<TOut>['usage'] } = {},
    ): StageResult<TOut> => {
      recordStageRun({
        stage: spec.stage,
        startedAt,
        durationMs: now() - startedAt,
        source,
        repairs: extra.repairs ?? 0,
        ok: true,
        prompt: `${spec.system}\n\n---\n\n${user}`,
        response: extra.response ?? '',
        issues: extra.issues ?? [],
        ...(extra.reason ? { note: extra.reason } : {}),
      });
      return {
        value,
        source,
        ...(extra.reason ? { reason: extra.reason } : {}),
        ...(extra.usage ? { usage: extra.usage } : {}),
      };
    };

    // ---------------------------------------------------------- demo mode
    // Recorded responses, validated like any other: a stale fixture fails loudly rather
    // than quietly feeding the demo something the schema no longer accepts.
    if (demoMode && spec.fixtures) {
      const recorded = spec.fixtures[key];
      if (recorded !== undefined) {
        const parsed = spec.schema.safeParse(recorded);
        if (parsed.success) {
          bump(spec.stage, { calls: 1, fixtureHits: 1 });
          return finish(parsed.data, 'fixture', { response: JSON.stringify(recorded) });
        }
        // Do not silently fall through to a provider call in demo mode — say so.
        const reason = `demo fixture for ${spec.stage} no longer matches its schema: ${issuesOf(parsed.error)[0] ?? 'unknown'}`;
        bump(spec.stage, { calls: 1, fallbacks: 1 });
        return finish(spec.fallback(input, reason), 'fallback', { reason });
      }
    }

    // ------------------------------------------------------------- cache
    if (db) {
      try {
        const [hit] = await db.select().from(llmCache).where(eq(llmCache.inputHash, key)).limit(1);
        if (hit) {
          const parsed = spec.schema.safeParse(hit.response);
          if (parsed.success) {
            bump(spec.stage, { calls: 1, cacheHits: 1 });
            return finish(parsed.data, 'cache', { response: JSON.stringify(hit.response) });
          }
          // A cached value that no longer validates is stale; drop it and carry on.
          await db.delete(llmCache).where(eq(llmCache.inputHash, key));
        }
      } catch {
        // A cache that is down is a performance problem, never a correctness one.
      }
    }

    // ---------------------------------------------------------- provider
    if (!generate || !config.enabledByDefault) {
      const reason = generate
        ? `${spec.stage} is not enabled by default`
        : 'no model provider configured';
      bump(spec.stage, { calls: 1, fallbacks: 1 });
      return finish(spec.fallback(input, reason), 'fallback', { reason });
    }

    const responseSchema = z.toJSONSchema(spec.schema as z.ZodType, { io: 'output' });
    let timedOut = false;

    const attempt = async (
      userText: string,
    ): Promise<{ raw: string; usage: { tokensIn: number; tokensOut: number }; parsed: z.ZodSafeParseResult<TOut> }> => {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      try {
        const result = await generate({
          model: config.model,
          system: spec.system,
          user: userText,
          responseSchema,
          temperature: config.temperature,
          maxOutputTokens: config.maxOutputTokens,
          location: config.location,
          signal: controller.signal,
        });
        let candidate: unknown;
        try {
          candidate = extractJson(result.text);
        } catch {
          return {
            raw: result.text,
            usage: { tokensIn: result.tokensIn, tokensOut: result.tokensOut },
            parsed: {
              success: false,
              error: new z.ZodError([{ code: 'custom', path: [], message: 'response was not valid JSON' }]),
            } as z.ZodSafeParseResult<TOut>,
          };
        }
        return {
          raw: result.text,
          usage: { tokensIn: result.tokensIn, tokensOut: result.tokensOut },
          parsed: spec.schema.safeParse(candidate),
        };
      } finally {
        clearTimeout(timer);
      }
    };

    let firstIssues: string[] = [];
    let lastRaw = '';
    let tokensIn = 0;
    let tokensOut = 0;

    const accountAndStore = async (value: TOut, raw: string, source: StageSource, repairs: number) => {
      const costUsd = estimateCost(config.model, tokensIn, tokensOut);
      bump(spec.stage, { calls: 1, tokensIn, tokensOut, costUsd });
      if (db) {
        try {
          await db
            .insert(llmCache)
            .values({
              inputHash: key,
              stage: spec.stage,
              model: config.model,
              response: value as object,
              tokensIn,
              tokensOut,
            })
            .onConflictDoNothing({ target: llmCache.inputHash });
        } catch {
          // Cache write failures must never fail the call.
        }
      }
      return finish(value, source, {
        repairs,
        response: raw,
        issues: firstIssues,
        usage: { tokensIn, tokensOut, costUsd },
      });
    };

    try {
      const first = await attempt(user);
      lastRaw = first.raw;
      tokensIn += first.usage.tokensIn;
      tokensOut += first.usage.tokensOut;
      if (first.parsed.success) return await accountAndStore(first.parsed.data, first.raw, 'model', 0);

      firstIssues = issuesOf(first.parsed.error);

      // Exactly one repair, quoting the validation errors. Constrained decoding means this
      // fires rarely — it is for output that is shaped right and means something wrong.
      const repairUser = [
        user,
        '',
        'Your previous response failed validation with these errors:',
        ...firstIssues.map((i) => `- ${i}`),
        '',
        'Return corrected JSON that satisfies the schema. Output JSON only.',
      ].join('\n');

      const second = await attempt(repairUser);
      lastRaw = second.raw;
      tokensIn += second.usage.tokensIn;
      tokensOut += second.usage.tokensOut;
      if (second.parsed.success) return await accountAndStore(second.parsed.data, second.raw, 'repaired', 1);

      const reason = `validation failed after one repair: ${issuesOf(second.parsed.error)[0] ?? 'unknown'}`;
      bump(spec.stage, {
        calls: 1,
        fallbacks: 1,
        tokensIn,
        tokensOut,
        costUsd: estimateCost(config.model, tokensIn, tokensOut),
      });
      return finish(spec.fallback(input, reason), 'fallback', {
        repairs: 1,
        response: second.raw,
        issues: [...firstIssues, ...issuesOf(second.parsed.error)],
        reason,
      });
    } catch (err) {
      const reason = timedOut
        ? `model did not respond within ${timeoutMs / 1000}s`
        : `model call failed: ${err instanceof Error ? err.message : String(err)}`;
      bump(spec.stage, { calls: 1, fallbacks: 1, tokensIn, tokensOut });
      return finish(spec.fallback(input, reason), 'fallback', {
        repairs: firstIssues.length > 0 ? 1 : 0,
        response: lastRaw,
        issues: firstIssues,
        reason,
      });
    }
  };
};

export type Gateway = ReturnType<typeof createGateway>;
