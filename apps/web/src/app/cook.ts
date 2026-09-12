import {
  CookProgressSchema,
  CookResponseSchema,
  TranscribeResponseSchema,
  type CookProgress,
  type CookResponse,
  type TranscribeResponse,
} from '@kitchen/contracts';
import { apiBaseUrl } from './api';

/**
 * The pipeline, from the client's side.
 *
 * Two calls, both of which exist only because they hold keys: transcription and the chain.
 * Everything else this app does — planning, scheduling, drawing the timeline — still
 * happens on the device, so losing the network costs you the recipes and not the session.
 *
 * Transcription posts raw audio rather than JSON. A base64 round-trip through a JSON body
 * inflates a two-megabyte recording by a third for no benefit, and `fetch` will send a Blob
 * with the right content type for free.
 */

export type CookOutcome =
  | { ok: true; result: CookResponse }
  | { ok: false; reason: string };

export type TranscriptOutcome =
  | { ok: true; text: string }
  | { ok: false; reason: string };

/** The pipeline fetches and reads several pages; it is slow in a way a spinner must admit. */
const PIPELINE_TIMEOUT_MS = 180_000;
const TRANSCRIBE_TIMEOUT_MS = 60_000;

const problem = async (response: Response): Promise<string> => {
  try {
    const body = (await response.json()) as { error?: { message?: unknown } };
    const message = body.error?.message;
    if (typeof message === 'string' && message.length > 0) return message;
  } catch {
    // Not JSON. The status is all we have.
  }
  return `the server answered ${response.status}`;
};

export const transcribeAnswer = async (
  audio: Blob,
  signal?: AbortSignal,
): Promise<TranscriptOutcome> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);
  signal?.addEventListener('abort', () => controller.abort(), { once: true });

  try {
    const response = await fetch(`${apiBaseUrl()}/v1/voice/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': audio.type || 'audio/webm' },
      body: audio,
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, reason: await problem(response) };

    const parsed = TranscribeResponseSchema.safeParse(await response.json());
    return parsed.success
      ? { ok: true, text: (parsed.data as TranscribeResponse).text }
      : { ok: false, reason: 'the server sent back something unexpected' };
  } catch (error) {
    return {
      ok: false,
      reason: controller.signal.aborted
        ? 'transcribing took too long'
        : `could not reach the server: ${error instanceof Error ? error.message : 'unknown'}`,
    };
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Run the chain and watch it work.
 *
 * Server-sent events over a POST, which is why this reads the body itself rather than using
 * `EventSource` — that only does GET, and the two answers do not belong in a query string.
 *
 * If anything about the stream goes wrong the call falls back to the plain JSON route. A
 * commentary that fails should cost you the commentary, not the dinner.
 */
export const runCookPipelineStreaming = async (
  input: { wants: string; pantry: string; wantRecipes?: number },
  onProgress: (event: CookProgress) => void,
  signal?: AbortSignal,
): Promise<CookOutcome> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PIPELINE_TIMEOUT_MS);
  signal?.addEventListener('abort', () => controller.abort(), { once: true });

  try {
    const response = await fetch(`${apiBaseUrl()}/v1/cook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({
        wants: input.wants,
        pantry: input.pantry,
        wantRecipes: input.wantRecipes ?? 5,
      }),
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, reason: await problem(response) };

    // An older API, or a proxy that will not stream, answers with plain JSON instead.
    const isStream = (response.headers.get('content-type') ?? '').includes('text/event-stream');
    if (!isStream || !response.body) {
      const parsed = CookResponseSchema.safeParse(await response.json());
      return parsed.success
        ? { ok: true, result: parsed.data }
        : { ok: false, reason: 'the recipes came back in a shape this version does not understand' };
    }

    let result: CookResponse | null = null;
    let failure: string | null = null;

    for await (const frame of frames(response.body)) {
      if (frame.event === 'progress') {
        const parsed = CookProgressSchema.safeParse(frame.data);
        if (!parsed.success) continue;
        if (parsed.data.kind === 'failed') failure = parsed.data.reason;
        onProgress(parsed.data);
      } else if (frame.event === 'result') {
        const parsed = CookResponseSchema.safeParse(frame.data);
        if (parsed.success) result = parsed.data;
      }
    }

    if (result) return { ok: true, result };
    return { ok: false, reason: failure ?? 'the search stopped before it finished' };
  } catch (error) {
    return {
      ok: false,
      reason: controller.signal.aborted
        ? 'finding recipes took too long'
        : `could not reach the server: ${error instanceof Error ? error.message : 'unknown'}`,
    };
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Split an SSE body into frames.
 *
 * A frame ends at a blank line, and a chunk boundary can land anywhere — including halfway
 * through a JSON payload — so the tail of each chunk is carried forward rather than parsed.
 */
async function* frames(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<{ event: string; data: unknown }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let split = buffer.indexOf('\n\n');
      while (split !== -1) {
        const block = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        split = buffer.indexOf('\n\n');

        let event = 'message';
        const data: string[] = [];
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data.push(line.slice(5).trim());
        }
        if (data.length === 0) continue;
        try {
          yield { event, data: JSON.parse(data.join('\n')) };
        } catch {
          // A frame we cannot parse is a frame we skip; the result frame is what matters.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export const runCookPipeline = async (
  input: { wants: string; pantry: string; wantRecipes?: number },
  signal?: AbortSignal,
): Promise<CookOutcome> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PIPELINE_TIMEOUT_MS);
  signal?.addEventListener('abort', () => controller.abort(), { once: true });

  try {
    const response = await fetch(`${apiBaseUrl()}/v1/cook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wants: input.wants,
        pantry: input.pantry,
        wantRecipes: input.wantRecipes ?? 5,
      }),
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, reason: await problem(response) };

    const parsed = CookResponseSchema.safeParse(await response.json());
    return parsed.success
      ? { ok: true, result: parsed.data }
      : { ok: false, reason: 'the recipes came back in a shape this version does not understand' };
  } catch (error) {
    return {
      ok: false,
      reason: controller.signal.aborted
        ? 'finding recipes took too long'
        : `could not reach the server: ${error instanceof Error ? error.message : 'unknown'}`,
    };
  } finally {
    clearTimeout(timer);
  }
};
