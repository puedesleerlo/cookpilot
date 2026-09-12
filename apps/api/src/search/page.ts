import { FetchedPageSchema, type FetchedPage } from '@kitchen/domain';
import { extractStructured } from '@kitchen/recipes';
import { USER_AGENT, isAllowed, rulesFor } from './robots';

/**
 * Fetch one page and reduce it to something a model can read.
 *
 * A modern recipe page is about 900KB of which maybe 4KB is the recipe: navigation, a life
 * story, six ad slots, a comment section and a related-posts carousel. Handing all of that
 * to a model is expensive and makes it worse, not better — the carousel is full of other
 * recipes' titles and it will happily extract one of those.
 *
 * So this strips to text, drops everything before the ingredients when it can find them,
 * and caps what goes through. Structured markup, where the page publishes it, is passed
 * alongside rather than instead: it is reliable for ingredients and yield and silent about
 * timing, which is the half that matters.
 */

const TIMEOUT_MS = 12_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_CHARS = 14_000;

export type FetchOutcome =
  | { ok: true; page: FetchedPage }
  | { ok: false; url: string; reason: string };

const BLOCK_TAGS = /<(script|style|noscript|svg|nav|footer|header|form|iframe|template)\b[^>]*>[\s\S]*?<\/\1>/gi;
const TAGS = /<[^>]+>/g;

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'",
  '&nbsp;': ' ', '&frac12;': '1/2', '&frac14;': '1/4', '&frac34;': '3/4', '&deg;': '°',
};

const decode = (text: string): string =>
  text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&[a-z]+\d*;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? ' ');

const titleOf = (html: string): string => {
  const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html);
  if (og?.[1]) return decode(og[1]).trim();
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return title?.[1] ? decode(title[1]).trim() : '';
};

/**
 * Keep the part of the page that is the recipe.
 *
 * "Ingredients" is the most reliable landmark on the open web: essentially every recipe page
 * has the word as a heading, and everything a scheduler needs is below it. When it is not
 * there, the text is taken from the top and capped, which is no worse than not trying.
 */
export const readableText = (html: string): string => {
  const stripped = decode(html.replace(BLOCK_TAGS, ' ').replace(TAGS, '\n'))
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');

  const landmark = /^\s*(ingredients|you will need|what you need)\s*$/im.exec(stripped);
  const from = landmark?.index !== undefined ? Math.max(0, landmark.index - 400) : 0;
  return stripped.slice(from, from + MAX_TEXT_CHARS);
};

export const fetchPage = async (url: string): Promise<FetchOutcome> => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, url, reason: 'not a URL' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, url, reason: 'not an http(s) URL' };
  }

  const rules = await rulesFor(parsed.origin);
  if (!isAllowed(rules, parsed.pathname)) {
    return { ok: false, url, reason: 'robots.txt disallows this path' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, url, reason: `page returned ${response.status}` };

    const type = response.headers.get('content-type') ?? '';
    if (!type.includes('html')) return { ok: false, url, reason: `not HTML (${type || 'unknown'})` };

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) {
      return { ok: false, url, reason: 'page is too large to be worth reading' };
    }
    const html = new TextDecoder('utf-8').decode(buffer);
    const text = readableText(html);
    if (text.length < 200) return { ok: false, url, reason: 'page had almost no readable text' };

    const structured = extractStructured(html);
    const jsonLd = structured.ok ? JSON.stringify(structured.recipe).slice(0, 4_000) : undefined;

    return {
      ok: true,
      page: FetchedPageSchema.parse({
        url: response.url || url,
        siteName: parsed.hostname.replace(/^www\./, ''),
        title: titleOf(html),
        text,
        ...(jsonLd ? { jsonLd } : {}),
      }),
    };
  } catch (error) {
    return {
      ok: false,
      url,
      reason: controller.signal.aborted
        ? 'the page took too long'
        : `could not be fetched: ${error instanceof Error ? error.message : 'unknown'}`,
    };
  } finally {
    clearTimeout(timer);
  }
};
