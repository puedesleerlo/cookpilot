import { BRAVE_ENDPOINT, type BraveProvider } from '../providers/brave';

/**
 * Brave web search.
 *
 * Recipe sites are a hostile corpus for search: the top results for any dish are round-ups
 * and SEO filler, and the pages that carry a real recipe are often three results down. So
 * this returns more than it needs and lets the extractor throw away what is not a recipe,
 * rather than trying to be clever about which URL looks promising. Deciding that from a
 * title is guesswork; deciding it from the page is reading.
 */

export type SearchHit = { url: string; title: string; description: string; siteName: string };

export type SearchOutcome =
  | { ok: true; hits: SearchHit[] }
  | { ok: false; reason: string };

const TIMEOUT_MS = 8_000;

const siteNameOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

type BraveWebResult = { url?: unknown; title?: unknown; description?: unknown };

export const searchWeb = async (
  provider: BraveProvider,
  query: string,
  count = 8,
): Promise<SearchOutcome> => {
  if (!provider.available) return { ok: false, reason: provider.reason };

  const url = new URL(BRAVE_ENDPOINT);
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(Math.min(20, Math.max(1, count))));
  url.searchParams.set('safesearch', 'moderate');
  // Recipe pages do not go stale, and the freshness filter costs recall.
  url.searchParams.set('result_filter', 'web');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': provider.apiKey,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return { ok: false, reason: `search returned ${response.status}` };
    }

    const body = (await response.json()) as { web?: { results?: BraveWebResult[] } };
    const hits = (body.web?.results ?? [])
      .flatMap((r): SearchHit[] => {
        if (typeof r.url !== 'string') return [];
        return [
          {
            url: r.url,
            title: typeof r.title === 'string' ? r.title : '',
            description: typeof r.description === 'string' ? r.description : '',
            siteName: siteNameOf(r.url),
          },
        ];
      });

    return { ok: true, hits };
  } catch (error) {
    const aborted = controller.signal.aborted;
    return {
      ok: false,
      reason: aborted ? 'search timed out' : `search failed: ${error instanceof Error ? error.message : 'unknown'}`,
    };
  } finally {
    clearTimeout(timer);
  }
};
