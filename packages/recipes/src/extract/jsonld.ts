/**
 * `schema.org/Recipe` extraction.
 *
 * This is the primary normalization path, not a fallback. Most recipe sites publish JSON-LD
 * because Google's rich results require it, which means the structure we need is usually
 * already there — free, instant and deterministic, with no model in the loop.
 *
 * The messy part is not finding the JSON-LD. It is that every site emits a different shape:
 * a bare object, an array, an `@graph`, `recipeIngredient` as strings or objects,
 * `recipeInstructions` as a string, an array of strings, a list of `HowToStep`, or a
 * `HowToSection` containing steps. All of those are real and all of them appear below.
 */

export type ExtractedRecipe = {
  title: string;
  description?: string;
  yieldServings?: number;
  totalTimeMin?: number;
  cookTimeMin?: number;
  prepTimeMin?: number;
  ingredients: string[];
  /** Instruction text, used to derive our own step wording. Never stored verbatim. */
  instructions: string[];
  tags: string[];
  imageUrl?: string;
  author?: string;
};

export type ExtractionOutcome =
  | { ok: true; method: 'json-ld' | 'microdata'; recipe: ExtractedRecipe }
  | { ok: false; reason: string };

type Json = Record<string, unknown>;

const asArray = <T>(value: T | T[] | undefined | null): T[] =>
  value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];

const text = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object') {
    const obj = value as Json;
    // Sites wrap plain strings in {"@value": "..."} or {"name": "..."} surprisingly often.
    return text(obj['@value']) ?? text(obj['name']) ?? text(obj['text']);
  }
  return undefined;
};

/** `PT1H30M`, `PT45M`, `P0DT0H30M`. Returns whole minutes. */
export const parseIsoDuration = (value: unknown): number | undefined => {
  const raw = text(value);
  if (!raw) return undefined;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(
    raw.trim(),
  );
  if (!m) {
    // A few sites emit "45 mins" in a field that should be ISO 8601. Plurals matter:
    // `min\b` does not match "mins", and that silently lost every such page.
    const loose = /(\d+)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/i.exec(raw);
    if (!loose) return undefined;
    const n = parseInt(loose[1]!, 10);
    return /^h/i.test(loose[2]!) ? n * 60 : n;
  }
  const days = Number(m[1] ?? 0);
  const hours = Number(m[2] ?? 0);
  const minutes = Number(m[3] ?? 0);
  const seconds = Number(m[4] ?? 0);
  const total = days * 1440 + hours * 60 + minutes + seconds / 60;
  return total > 0 ? Math.round(total) : undefined;
};

/** `"4 servings"`, `4`, `["4", "4 servings"]`, `"4-6"`. */
export const parseYield = (value: unknown): number | undefined => {
  for (const candidate of asArray(value)) {
    const raw = text(candidate);
    if (!raw) continue;
    const m = /(\d+)/.exec(raw);
    if (m) {
      const n = parseInt(m[1]!, 10);
      if (n > 0 && n <= 100) return n;
    }
  }
  return undefined;
};

/** Instructions arrive as a string, strings, HowToStep, or HowToSection wrapping steps. */
const flattenInstructions = (value: unknown, depth = 0): string[] => {
  if (depth > 4) return [];
  const out: string[] = [];
  for (const entry of asArray(value)) {
    if (typeof entry === 'string') {
      // A single blob of prose with newlines is common; split it into steps.
      out.push(
        ...entry
          .split(/\r?\n+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
      );
      continue;
    }
    if (entry && typeof entry === 'object') {
      const obj = entry as Json;
      const type = String(obj['@type'] ?? '');
      if (/HowToSection/i.test(type)) {
        out.push(...flattenInstructions(obj['itemListElement'], depth + 1));
        continue;
      }
      const step = text(obj['text']) ?? text(obj['name']);
      if (step) out.push(step);
      else if (obj['itemListElement']) out.push(...flattenInstructions(obj['itemListElement'], depth + 1));
    }
  }
  // Numbering is presentational; our own wording carries the order.
  return out.map((s) => s.replace(/^(?:step\s*)?\d+[.):]\s*/i, '').trim()).filter((s) => s.length > 1);
};

const isRecipeNode = (node: unknown): node is Json => {
  if (!node || typeof node !== 'object') return false;
  const types = asArray((node as Json)['@type']).map((t) => String(t).toLowerCase());
  return types.includes('recipe');
};

/** Walk every shape a site might nest a Recipe inside. */
export const findRecipeNode = (parsed: unknown, depth = 0): Json | null => {
  if (depth > 6 || !parsed) return null;
  if (Array.isArray(parsed)) {
    for (const entry of parsed) {
      const found = findRecipeNode(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof parsed !== 'object') return null;
  if (isRecipeNode(parsed)) return parsed as Json;
  const obj = parsed as Json;
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement']) {
    const found = findRecipeNode(obj[key], depth + 1);
    if (found) return found;
  }
  return null;
};

const SCRIPT_RE = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/** Some sites emit invalid JSON-LD; one bad block must not lose the good one. */
const parseBlocks = (html: string): unknown[] => {
  const blocks: unknown[] = [];
  for (const match of html.matchAll(SCRIPT_RE)) {
    const body = (match[1] ?? '').trim();
    if (!body) continue;
    try {
      blocks.push(JSON.parse(body));
    } catch {
      // A stray trailing comma, or a raw control character inside a string. Repair, then give up.
      try {
        blocks.push(
          JSON.parse(
            body
              .replace(/,\s*([}\]])/g, '$1')
              // Unescaped control characters inside a JSON string are precisely the
              // breakage being repaired here, so matching them is the point.
              // eslint-disable-next-line no-control-regex
              .replace(/[\u0000-\u001f]+/g, ' '),
          ),
        );
      } catch {
        continue;
      }
    }
  }
  return blocks;
};

const toExtracted = (node: Json): ExtractionOutcome => {
  const title = text(node['name']) ?? text(node['headline']);
  const ingredients = asArray(node['recipeIngredient'] ?? node['ingredients'])
    .map((i) => text(i))
    .filter((s): s is string => Boolean(s));
  const instructions = flattenInstructions(node['recipeInstructions']);

  if (!title) return { ok: false, reason: 'the markup has no recipe name' };
  if (ingredients.length === 0) return { ok: false, reason: 'the markup lists no ingredients' };
  if (instructions.length === 0) return { ok: false, reason: 'the markup has no instructions' };

  const cookTimeMin = parseIsoDuration(node['cookTime']);
  const prepTimeMin = parseIsoDuration(node['prepTime']);
  const totalTimeMin =
    parseIsoDuration(node['totalTime']) ??
    (cookTimeMin !== undefined || prepTimeMin !== undefined
      ? (cookTimeMin ?? 0) + (prepTimeMin ?? 0)
      : undefined);

  const image = asArray(node['image'])[0];
  const author = asArray(node['author'])[0];

  return {
    ok: true,
    method: 'json-ld',
    recipe: {
      title,
      ...(text(node['description']) ? { description: text(node['description'])! } : {}),
      ...(parseYield(node['recipeYield']) !== undefined ? { yieldServings: parseYield(node['recipeYield'])! } : {}),
      ...(totalTimeMin !== undefined ? { totalTimeMin } : {}),
      ...(cookTimeMin !== undefined ? { cookTimeMin } : {}),
      ...(prepTimeMin !== undefined ? { prepTimeMin } : {}),
      ingredients,
      instructions,
      tags: [
        ...asArray(node['recipeCuisine']).map((t) => text(t)),
        ...asArray(node['recipeCategory']).map((t) => text(t)),
        ...asArray(node['keywords']).flatMap((k) => (text(k) ?? '').split(',')),
      ]
        .map((t) => (t ?? '').trim().toLowerCase())
        .filter((t) => t.length > 0 && t.length < 40)
        .slice(0, 12),
      ...(text(image) ? { imageUrl: text(image)! } : {}),
      ...(text(author) ? { author: text(author)! } : {}),
    },
  };
};

export const extractJsonLd = (html: string): ExtractionOutcome => {
  const blocks = parseBlocks(html);
  if (blocks.length === 0) return { ok: false, reason: 'no JSON-LD found on the page' };
  for (const block of blocks) {
    const node = findRecipeNode(block);
    if (node) return toExtracted(node);
  }
  return { ok: false, reason: 'JSON-LD is present but contains no schema.org/Recipe' };
};

// ------------------------------------------------------------------ microdata

const attr = (tag: string, name: string): string | undefined =>
  new RegExp(`${name}=["']([^"']*)["']`, 'i').exec(tag)?.[1];

const stripTags = (html: string): string =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Microdata/RDFa, for the minority of sites that never adopted JSON-LD. Deliberately
 * simple: collect `itemprop` values by name, and accept that this is a second-best path.
 */
export const extractMicrodata = (html: string): ExtractionOutcome => {
  if (!/itemtype=["'][^"']*schema\.org\/Recipe/i.test(html)) {
    return { ok: false, reason: 'no schema.org/Recipe microdata on the page' };
  }

  const byProp = new Map<string, string[]>();
  const add = (prop: string, value: string | undefined) => {
    if (!value) return;
    const list = byProp.get(prop) ?? [];
    list.push(value.trim());
    byProp.set(prop, list);
  };

  // Elements with content: <li itemprop="recipeIngredient">200 g rice</li>
  for (const match of html.matchAll(/<([a-z0-9]+)([^>]*itemprop=["']([^"']+)["'][^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const tag = `<${match[1]}${match[2]}>`;
    add(match[3]!.trim(), attr(tag, 'content') ?? attr(tag, 'datetime') ?? stripTags(match[4] ?? ''));
  }

  // Void and self-closing elements carry their value in an attribute and have no closing
  // tag, so the pattern above never sees them: <meta itemprop="totalTime" content="PT25M"/>
  for (const match of html.matchAll(/<(?:meta|link|img|time)\b([^>]*itemprop=["']([^"']+)["'][^>]*)\/?>/gi)) {
    const tag = `<x${match[1]}>`;
    add(match[2]!.trim(), attr(tag, 'content') ?? attr(tag, 'datetime') ?? attr(tag, 'href'));
  }

  const first = (p: string) => byProp.get(p)?.[0];
  const title = first('name') ?? first('headline');
  const ingredients = byProp.get('recipeIngredient') ?? byProp.get('ingredients') ?? [];
  const instructions = (byProp.get('recipeInstructions') ?? []).flatMap((s) =>
    s.split(/\r?\n+/).map((x) => x.trim()).filter(Boolean),
  );

  if (!title) return { ok: false, reason: 'the microdata has no recipe name' };
  if (ingredients.length === 0) return { ok: false, reason: 'the microdata lists no ingredients' };
  if (instructions.length === 0) return { ok: false, reason: 'the microdata has no instructions' };

  const cookTimeMin = parseIsoDuration(first('cookTime'));
  const prepTimeMin = parseIsoDuration(first('prepTime'));

  return {
    ok: true,
    method: 'microdata',
    recipe: {
      title,
      ingredients,
      instructions,
      ...(parseYield(first('recipeYield')) !== undefined ? { yieldServings: parseYield(first('recipeYield'))! } : {}),
      ...(parseIsoDuration(first('totalTime')) !== undefined
        ? { totalTimeMin: parseIsoDuration(first('totalTime'))! }
        : cookTimeMin !== undefined || prepTimeMin !== undefined
          ? { totalTimeMin: (cookTimeMin ?? 0) + (prepTimeMin ?? 0) }
          : {}),
      ...(cookTimeMin !== undefined ? { cookTimeMin } : {}),
      ...(prepTimeMin !== undefined ? { prepTimeMin } : {}),
      tags: [],
    },
  };
};

/**
 * The ordered strategy: JSON-LD, then microdata. The LLM path is what happens after both
 * of these fail, and how often that is, is a measured number rather than a guess — see
 * this change's design.md.
 */
export const extractStructured = (html: string): ExtractionOutcome => {
  const jsonLd = extractJsonLd(html);
  if (jsonLd.ok) return jsonLd;
  const micro = extractMicrodata(html);
  if (micro.ok) return micro;
  return { ok: false, reason: `${jsonLd.reason}; ${micro.reason}` };
};
