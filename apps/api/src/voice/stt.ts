import type { ElevenLabsProvider } from '../providers/elevenlabs';

/**
 * Speech to text, server side.
 *
 * The key never leaves this process. The browser records audio and posts the bytes here;
 * a client holding an ElevenLabs key is a key you have published, and no amount of
 * short-lived-token cleverness is needed when the audio can simply take one more hop.
 *
 * Scribe rather than a realtime socket: these are two discrete answers to two questions,
 * not a conversation. Recording, then transcribing, is both cheaper and more accurate, and
 * it degrades to "the recording failed, type it instead" cleanly.
 */

export const STT_ENDPOINT = 'https://api.elevenlabs.io/v1/speech-to-text';
export const STT_MODEL = 'scribe_v1';

const TIMEOUT_MS = 30_000;
/** Two spoken answers. Anything much larger is not what this endpoint is for. */
export const MAX_AUDIO_BYTES = 12 * 1024 * 1024;

export type TranscribeOutcome =
  | { ok: true; text: string }
  | { ok: false; reason: string };

export const transcribe = async (
  provider: ElevenLabsProvider,
  audio: Uint8Array,
  contentType: string,
): Promise<TranscribeOutcome> => {
  if (!provider.available) return { ok: false, reason: provider.reason };
  if (audio.byteLength === 0) return { ok: false, reason: 'the recording was empty' };
  if (audio.byteLength > MAX_AUDIO_BYTES) {
    return { ok: false, reason: 'the recording is too long' };
  }

  const form = new FormData();
  form.append('model_id', STT_MODEL);
  // Copy into a fresh ArrayBuffer: a Uint8Array view of a pooled Node buffer can carry
  // more bytes than it claims, and Blob would send all of them.
  const bytes = new Uint8Array(audio.byteLength);
  bytes.set(audio);
  form.append('file', new Blob([bytes.buffer], { type: contentType || 'audio/webm' }), 'answer.webm');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(STT_ENDPOINT, {
      method: 'POST',
      headers: { 'xi-api-key': provider.apiKey, Accept: 'application/json' },
      body: form,
      signal: controller.signal,
    });

    if (!response.ok) {
      // The body can echo request detail; the status is all the caller needs.
      return { ok: false, reason: `transcription returned ${response.status}` };
    }

    const body = (await response.json()) as { text?: unknown };
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    return text.length > 0
      ? { ok: true, text }
      : { ok: false, reason: 'nothing was said, or nothing could be made out' };
  } catch (error) {
    return {
      ok: false,
      reason: controller.signal.aborted
        ? 'transcription timed out'
        : `transcription failed: ${error instanceof Error ? error.message : 'unknown'}`,
    };
  } finally {
    clearTimeout(timer);
  }
};
