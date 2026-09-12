import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { MAX_TOKENS, MODEL_ID, REQUEST_TIMEOUT_MS, STAGE_EFFORT, type StageName, getApiKey } from './config';
import { recordStageRun } from './debug';

/**
 * The single boundary between Kitchen Compiler and the model.
 *
 * Two properties are structural here rather than a discipline each stage remembers:
 *
 *   1. A stage cannot skip its fallback, because the stage never calls the model — the
 *      client does, and the client is what decides whether a model is available.
 *   2. Nothing leaves this file unvalidated. Every return value has been through the
 *      stage's Zod schema.
 *
 * The model never makes a scheduling decision. It extracts, normalizes, ranks and
 * prettifies. `src/llm` is lint-forbidden from importing `@/scheduler` at all.
 */

export type StageSource = 'model' | 'repaired' | 'fallback';

export type StageResult<T> = {
  value: T;
  source: StageSource;
  /** Populated when the fallback ran, so callers can surface degraded quality honestly. */
  reason?: string;
};

export type StageSpec<TIn, TOut> = {
  name: StageName;
  schema: z.ZodType<TOut>;
  system: string;
  buildUser: (input: TIn) => string;
  /** Always present. This is what makes the no-key path a guarantee rather than a hope. */
  fallback: (input: TIn, reason: string) => TOut;
};

/** Injectable so tests can drive the client without a network or a key. */
export type Transport = (req: {
  system: string;
  user: string;
  jsonSchema: unknown;
  effort: 'low' | 'medium' | 'high';
  signal: AbortSignal;
}) => Promise<string>;

let transportOverride: Transport | null = null;

/** Test seam. Pass `null` to restore the real SDK transport. */
export const setTransport = (t: Transport | null): void => {
  transportOverride = t;
};

const sdkTransport: Transport = async ({ system, user, jsonSchema, effort, signal }) => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('no api key');
  const client = new Anthropic({
    apiKey,
    // The app has no backend; the user supplies their own key. See DECISIONS D-014.
    dangerouslyAllowBrowser: true,
  });
  const response = await client.messages.create(
    {
      model: MODEL_ID,
      max_tokens: MAX_TOKENS,
      system,
      thinking: { type: 'adaptive' },
      output_config: {
        effort,
        format: { type: 'json_schema', schema: jsonSchema as Record<string, unknown> },
      },
      messages: [{ role: 'user', content: user }],
    } as Anthropic.MessageCreateParamsNonStreaming,
    { signal },
  );
  if (response.stop_reason === 'refusal') {
    throw new Error(`model declined: ${response.stop_details?.category ?? 'unspecified'}`);
  }
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
};

const issuesOf = (err: z.ZodError): string[] =>
  err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);

/** Models sometimes wrap JSON in a fence even under structured outputs. */
const extractJson = (raw: string): unknown => {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  const body = (fenced?.[1] ?? raw).trim();
  return JSON.parse(body);
};

export async function callStage<TIn, TOut>(
  spec: StageSpec<TIn, TOut>,
  input: TIn,
): Promise<StageResult<TOut>> {
  const startedAt = Date.now();
  const user = spec.buildUser(input);
  const transport = transportOverride ?? sdkTransport;
  const live = transportOverride !== null || getApiKey() !== null;

  const finish = (
    value: TOut,
    source: StageSource,
    extra: { repairs: number; response: string; issues: string[]; reason?: string },
  ): StageResult<TOut> => {
    recordStageRun({
      stage: spec.name,
      startedAt,
      durationMs: Date.now() - startedAt,
      source,
      repairs: extra.repairs,
      ok: true,
      prompt: `${spec.system}\n\n---\n\n${user}`,
      response: extra.response,
      issues: extra.issues,
      note: extra.reason,
    });
    return extra.reason ? { value, source, reason: extra.reason } : { value, source };
  };

  if (!live) {
    const reason = 'no API key configured';
    return finish(spec.fallback(input, reason), 'fallback', { repairs: 0, response: '', issues: [], reason });
  }

  const jsonSchema = z.toJSONSchema(spec.schema as z.ZodType, { io: 'output' });
  const effort = STAGE_EFFORT[spec.name];

  const attempt = async (userText: string): Promise<{ raw: string; parsed: z.ZodSafeParseResult<TOut> }> => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);
    try {
      const raw = await transport({
        system: spec.system,
        user: userText,
        jsonSchema,
        effort,
        signal: controller.signal,
      });
      let candidate: unknown;
      try {
        candidate = extractJson(raw);
      } catch {
        return {
          raw,
          parsed: {
            success: false,
            error: new z.ZodError([
              { code: 'custom', path: [], message: 'response was not valid JSON' },
            ]),
          } as z.ZodSafeParseResult<TOut>,
        };
      }
      return { raw, parsed: spec.schema.safeParse(candidate) };
    } finally {
      clearTimeout(timer);
    }
  };

  let firstIssues: string[] = [];
  let lastRaw = '';
  // Set by the timeout callback. An abort surfaces as a DOMException, which is not
  // `instanceof Error` in every runtime, so the flag is the reliable signal - not the
  // shape of whatever the transport happened to reject with.
  let timedOut = false;
  try {
    const first = await attempt(user);
    lastRaw = first.raw;
    if (first.parsed.success) {
      return finish(first.parsed.data, 'model', { repairs: 0, response: first.raw, issues: [] });
    }
    firstIssues = issuesOf(first.parsed.error);

    // Exactly one repair pass, quoting the validation errors verbatim.
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
    if (second.parsed.success) {
      return finish(second.parsed.data, 'repaired', {
        repairs: 1,
        response: second.raw,
        issues: firstIssues,
      });
    }
    const reason = `validation failed after one repair: ${issuesOf(second.parsed.error)[0] ?? 'unknown'}`;
    return finish(spec.fallback(input, reason), 'fallback', {
      repairs: 1,
      response: second.raw,
      issues: [...firstIssues, ...issuesOf(second.parsed.error)],
      reason,
    });
  } catch (err) {
    const reason = timedOut
      ? `model did not respond within ${REQUEST_TIMEOUT_MS / 1000}s`
      : `model call failed: ${err instanceof Error ? err.message : String(err)}`;
    return finish(spec.fallback(input, reason), 'fallback', {
      repairs: firstIssues.length > 0 ? 1 : 0,
      response: lastRaw,
      issues: firstIssues,
      reason,
    });
  }
}
