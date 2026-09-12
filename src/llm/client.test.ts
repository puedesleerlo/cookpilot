import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { callStage, setTransport, type Transport } from './client';
import { clearStageRuns, stageRuns } from './debug';
import { REQUEST_TIMEOUT_MS, getApiKey, redact } from './config';

const Schema = z.object({ answer: z.string(), count: z.number().int() });
type Out = z.infer<typeof Schema>;

const spec = (fallbackValue: Out = { answer: 'fallback', count: 0 }) => ({
  name: 'L3-normalize' as const,
  schema: Schema,
  system: 'You extract things.',
  buildUser: (input: string) => `Input: ${input}`,
  fallback: () => fallbackValue,
});

afterEach(() => {
  setTransport(null);
  clearStageRuns();
  vi.unstubAllEnvs();
});

describe('the happy path', () => {
  it('returns validated data and marks it as coming from the model', async () => {
    setTransport(async () => JSON.stringify({ answer: 'ok', count: 3 }));
    const result = await callStage(spec(), 'hello');
    expect(result.value).toEqual({ answer: 'ok', count: 3 });
    expect(result.source).toBe('model');
  });

  it('tolerates a fenced JSON response', async () => {
    setTransport(async () => '```json\n{"answer":"ok","count":1}\n```');
    const result = await callStage(spec(), 'hello');
    expect(result.source).toBe('model');
    expect(result.value.count).toBe(1);
  });

  it('sends the schema so the model is constrained up front', async () => {
    const seen: unknown[] = [];
    setTransport(async ({ jsonSchema }) => {
      seen.push(jsonSchema);
      return JSON.stringify({ answer: 'ok', count: 0 });
    });
    await callStage(spec(), 'hello');
    expect(seen[0]).toMatchObject({ type: 'object', properties: { answer: { type: 'string' } } });
  });
});

describe('the repair path', () => {
  it('repairs once, quoting the validation errors', async () => {
    const prompts: string[] = [];
    const transport: Transport = async ({ user }) => {
      prompts.push(user);
      return prompts.length === 1
        ? JSON.stringify({ answer: 'ok' })
        : JSON.stringify({ answer: 'ok', count: 7 });
    };
    setTransport(transport);
    const result = await callStage(spec(), 'hello');
    expect(result.source).toBe('repaired');
    expect(result.value.count).toBe(7);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('failed validation');
    expect(prompts[1]).toContain('count');
  });

  it('repairs exactly once, never twice', async () => {
    let calls = 0;
    setTransport(async () => {
      calls++;
      return JSON.stringify({ answer: 'ok' });
    });
    const result = await callStage(spec(), 'hello');
    expect(calls).toBe(2);
    expect(result.source).toBe('fallback');
  });
});

describe('falling back', () => {
  it('falls back deterministically when the repair also fails', async () => {
    setTransport(async () => '{"nope":true}');
    const result = await callStage(spec({ answer: 'deterministic', count: 42 }), 'hello');
    expect(result.source).toBe('fallback');
    expect(result.value).toEqual({ answer: 'deterministic', count: 42 });
    expect(result.reason).toContain('after one repair');
  });

  it('aborts and falls back rather than hanging when the model does not answer', async () => {
    // A transport that never resolves unless it is aborted — the real hang case.
    setTransport(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    );
    vi.useFakeTimers();
    try {
      const pending = callStage(spec(), 'hello');
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 10);
      const result = await pending;
      expect(result.source).toBe('fallback');
      expect(result.reason).toContain('did not respond');
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back when the transport throws', async () => {
    setTransport(async () => {
      throw new Error('network is down');
    });
    const result = await callStage(spec(), 'hello');
    expect(result.source).toBe('fallback');
    expect(result.reason).toContain('network is down');
  });

  it('falls back when the response is not JSON at all', async () => {
    setTransport(async () => 'I am afraid I cannot do that.');
    const result = await callStage(spec(), 'hello');
    expect(result.source).toBe('fallback');
  });
});

describe('working with no API key', () => {
  it('makes no request and uses the fallback', async () => {
    vi.stubEnv('VITE_ANTHROPIC_API_KEY', '');
    // No transport override, so the client must decide from the key alone.
    setTransport(null);
    const result = await callStage(spec({ answer: 'offline', count: 1 }), 'hello');
    expect(result.source).toBe('fallback');
    expect(result.reason).toBe('no API key configured');
  });

  it('treats a blank key as no key', () => {
    expect(getApiKey({ VITE_ANTHROPIC_API_KEY: '   ' })).toBeNull();
    expect(getApiKey({ VITE_ANTHROPIC_API_KEY: 'sk-ant-abc' })).toBe('sk-ant-abc');
  });
});

describe('the debug log', () => {
  it('records the stage, the source and whether a repair was needed', async () => {
    let n = 0;
    setTransport(async () => (++n === 1 ? '{"answer":"ok"}' : '{"answer":"ok","count":2}'));
    await callStage(spec(), 'hello');
    const [entry] = stageRuns();
    expect(entry?.stage).toBe('L3-normalize');
    expect(entry?.source).toBe('repaired');
    expect(entry?.repairs).toBe(1);
    expect(entry?.issues.some((i) => i.includes('count'))).toBe(true);
  });

  it('never records anything that looks like a key', async () => {
    setTransport(async () => JSON.stringify({ answer: 'key is sk-ant-abcdefghijkl', count: 0 }));
    await callStage(spec(), 'my key is sk-ant-zyxwvutsrqpo');
    const serialised = JSON.stringify(stageRuns());
    expect(serialised).not.toContain('sk-ant-abcdefghijkl');
    expect(serialised).not.toContain('sk-ant-zyxwvutsrqpo');
    expect(serialised).toContain('sk-ant-***');
  });

  it('redacts keys wherever they appear', () => {
    expect(redact('use sk-ant-api03-AAAA1111 now')).toBe('use sk-ant-*** now');
  });
});

describe('the model never schedules', () => {
  it('returns only the stage schema, which carries no times or assignments', async () => {
    setTransport(async () => JSON.stringify({ answer: 'ok', count: 1 }));
    const result = await callStage(spec(), 'hello');
    const keys = Object.keys(result.value as object);
    for (const forbidden of ['startMin', 'endMin', 'cookId', 'resources', 'scheduled']) {
      expect(keys).not.toContain(forbidden);
    }
  });
});
