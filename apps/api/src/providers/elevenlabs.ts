import type { SecretStore } from '../config/loader';

/**
 * ElevenLabs — voice I/O, never the authority.
 *
 * The only place `ELEVENLABS_API_KEY` is read, and it is read here so that the client can
 * be handed a short-lived token instead of a key. A browser holding a provider key is a
 * key you have published.
 *
 * The adapter lands in `add-voice-provider-abstraction`.
 */
export const ELEVENLABS_SECRET = 'ELEVENLABS_API_KEY';

export type ElevenLabsProvider =
  | { available: true; apiKey: string }
  | { available: false; reason: string };

export const createElevenLabsProvider = (store: SecretStore): ElevenLabsProvider => {
  const apiKey = store.optional(ELEVENLABS_SECRET);
  return apiKey
    ? { available: true, apiKey }
    : { available: false, reason: 'ELEVENLABS_API_KEY is not configured; voice falls back to text.' };
};
