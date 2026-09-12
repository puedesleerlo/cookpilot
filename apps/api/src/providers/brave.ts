import type { SecretStore } from '../config/loader';

/**
 * Brave Search — external recipe discovery.
 *
 * The only place `BRAVE_API_KEY` is read. Brave runs its own index rather than reselling
 * scraped results from another engine, which removes a category of legal exposure that
 * the cheaper alternatives carry.
 *
 * Discovery is optional: without the key, internal search still answers, and the corpus
 * still grows from imports. The search client lands in `add-search-provider-abstraction`.
 */
export const BRAVE_SECRET = 'BRAVE_API_KEY';
export const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';

export type BraveProvider =
  | { available: true; apiKey: string; endpoint: string }
  | { available: false; reason: string };

export const createBraveProvider = (store: SecretStore): BraveProvider => {
  const apiKey = store.optional(BRAVE_SECRET);
  return apiKey
    ? { available: true, apiKey, endpoint: BRAVE_ENDPOINT }
    : { available: false, reason: 'BRAVE_API_KEY is not configured; external discovery is off.' };
};
