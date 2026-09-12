import {
  CookResponseSchema,
  TranscribeResponseSchema,
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
