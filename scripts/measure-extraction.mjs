/**
 * Measures the structured-markup hit rate on real recipe pages.
 *
 * This exists because the whole ingestion design turns on one number: how often the
 * deterministic path works. If it is high, LLM normalization is an edge case and extraction
 * is free, instant and reproducible. If it is low, the worker needs the model on the hot
 * path and the cost model changes. Guessing that number would have been the easiest thing
 * to get wrong, so it is measured and written into the change's design.md.
 *
 * Manners, non-negotiable: honour robots.txt, identify the bot with a contact URL, one
 * request per domain at a time with a delay between.
 *
 * Run: node scripts/measure-extraction.mjs [--out report.json]
 */
import { writeFileSync } from 'node:fs';
import process from 'node:process';
import { extractJsonLd, extractMicrodata } from '../packages/recipes/src/extract/jsonld.ts';

const USER_AGENT =
  'KitchenCompilerBot/0.1 (+https://github.com/kitchen-compiler/kitchen-compiler; recipe structure extraction)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Sites across large publishers, food media, independent blogs and aggregators —
 * deliberately not all on one CMS, since a single platform would measure that platform
 * rather than the web.
 *
 * Recipe URLs are DISCOVERED from each site rather than written here. Hand-written URLs rot
 * (the first run of this script 404'd on eleven of twenty), and a sample skewed toward
 * whichever URLs happened to still resolve is not a sample.
 */
const SITES = [
  { home: 'https://www.allrecipes.com/recipes-a-z-6735880', pattern: /allrecipes\.com\/(recipe\/\d+\/[a-z0-9-]+|[a-z0-9-]+-recipe-\d{6,})/ },
  { home: 'https://www.seriouseats.com/recipes-by-method-5117907', pattern: /seriouseats\.com\/[a-z0-9-]+-\d{6,}/ },
  { home: 'https://www.bbcgoodfood.com/recipes', pattern: /\/recipes\/[a-z0-9-]+$/ },
  { home: 'https://www.simplyrecipes.com/recipes-5090746', pattern: /simplyrecipes\.com\/[a-z0-9-]+-\d{6,}/ },
  { home: 'https://www.budgetbytes.com/category/recipes/', pattern: /budgetbytes\.com\/[a-z0-9-]+\/$/ },
  { home: 'https://www.delish.com/cooking/recipe-ideas/', pattern: /\/a\d+\/[a-z0-9-]+\// },
  { home: 'https://www.recipetineats.com/recipes/', pattern: /recipetineats\.com\/[a-z0-9-]+\/$/ },
  { home: 'https://www.bonappetit.com/recipes', pattern: /bonappetit\.com\/recipe\/[a-z0-9-]+/ },
  { home: 'https://www.food.com/recipe', pattern: /food\.com\/recipe\/[a-z0-9-]+-\d+/ },
  { home: 'https://www.themediterraneandish.com/recipes/', pattern: /themediterraneandish\.com\/[a-z0-9-]+\/$/ },
  { home: 'https://minimalistbaker.com/recipe-index/', pattern: /minimalistbaker\.com\/[a-z0-9-]+\/$/ },
  { home: 'https://www.loveandlemons.com/recipes/', pattern: /loveandlemons\.com\/[a-z0-9-]+\/$/ },
  { home: 'https://www.kingarthurbaking.com/recipes', pattern: /kingarthurbaking\.com\/recipes\/[a-z0-9-]+-recipe/ },
  { home: 'https://cookieandkate.com/recipes/', pattern: /cookieandkate\.com\/[a-z0-9-]+-recipe\/?$/ },
  { home: 'https://www.eatingwell.com/recipes/', pattern: /eatingwell\.com\/recipe\/\d+\/[a-z0-9-]+/ },
  { home: 'https://natashaskitchen.com/category/recipe/', pattern: /natashaskitchen\.com\/[a-z0-9-]+-recipe\/?$/ },
  { home: 'https://www.tasteofhome.com/collection/best-dinner-recipes/', pattern: /tasteofhome\.com\/recipes\/[a-z0-9-]+\/?$/ },
];

/** Seeds that are known-good; discovery tops the sample up from there. */
const SEED_URLS = [
  'https://www.allrecipes.com/recipe/223042/chicken-parmesan/',
  'https://www.seriouseats.com/the-best-chili-recipe-8422961',
  'https://www.bbcgoodfood.com/recipes/classic-lasagne',
  'https://www.foodnetwork.com/recipes/alton-brown/baked-macaroni-and-cheese-recipe-1939524',
  'https://www.simplyrecipes.com/recipes/homemade_pizza/',
  'https://www.budgetbytes.com/garlic-noodles/',
  'https://cooking.nytimes.com/recipes/1017937-no-knead-bread',
  'https://www.loveandlemons.com/pasta-salad-recipe/',
  'https://minimalistbaker.com/1-bowl-vegan-banana-bread/',
  'https://www.delish.com/cooking/recipe-ideas/a19636089/best-chicken-alfredo-recipe/',
  'https://www.taste.com.au/recipes/spaghetti-bolognese-recipe/',
  'https://www.jamieoliver.com/recipes/vegetables-recipes/pasta-alla-norma/',
  'https://www.recipetineats.com/chicken-stir-fry/',
  'https://www.epicurious.com/recipes/food/views/classic-caesar-salad',
  'https://www.thekitchn.com/how-to-cook-rice-on-the-stove-236612',
  'https://smittenkitchen.com/2019/01/simplest-brisket-with-braised-onions/',
  'https://www.bonappetit.com/recipe/bas-best-chocolate-chip-cookies',
  'https://www.food.com/recipe/best-banana-bread-2886',
  'https://www.themediterraneandish.com/greek-salad-recipe/',
  'https://www.seriouseats.com/classic-panzanella-salad-recipe',
];

const PER_SITE = 3;

/**
 * Paths that are not recipes.
 *
 * The first discovery run scored 47%, and every single "miss" turned out to be /feed/,
 * /wp-json/, /about/ or a roundup index — pages the extractor correctly reported as
 * containing no recipe. That number measured my URL filter, not the extractor. The
 * denominator has to be recipe pages or the measurement means nothing.
 */
const NOT_A_RECIPE =
  /\/(feed|wp-json|wp-admin|comments|page|category|tag|author|about|contact|privacy|terms|search|join|subscribe|shop|store|cookbooks?|recipe-index|recipes|all-recipes|web-stories|amp)\/?$|\/(feed|wp-json)\/|(-recipes?-\d+|best-[a-z-]*-recipes|\d+-[a-z-]+-recipes)$/i;

/** Pull real recipe URLs out of a site's own index page. */
async function discover(site) {
  try {
    const res = await fetch(site.home, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const base = new URL(site.home);
    const found = new Set();
    for (const m of html.matchAll(/href=["']([^"'#?]+)["']/gi)) {
      let href = m[1];
      if (!href) continue;
      try {
        href = new URL(href, base).toString();
      } catch {
        continue;
      }
      if (new URL(href).host !== base.host) continue;
      if (!site.pattern.test(href)) continue;
      if (NOT_A_RECIPE.test(new URL(href).pathname)) continue;
      found.add(href.split('?')[0]);
      if (found.size >= PER_SITE) break;
    }
    return [...found];
  } catch {
    return [];
  }
}

console.log('discovering real recipe URLs...');
const discovered = [];
for (const site of SITES) {
  const urls = await discover(site);
  console.log(`  ${new URL(site.home).host.padEnd(28)} ${urls.length} found`);
  discovered.push(...urls);
  await sleep(1500);
}

const URLS = [...new Set([...discovered, ...SEED_URLS])];
console.log(`\nmeasuring ${URLS.length} URLs\n`);

/** A small, correct-enough robots.txt reader: longest matching Disallow wins. */
const robotsCache = new Map();

async function allowedByRobots(url) {
  const { origin, pathname } = new URL(url);
  if (!robotsCache.has(origin)) {
    try {
      const res = await fetch(`${origin}/robots.txt`, {
        headers: { 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(10_000),
      });
      robotsCache.set(origin, res.ok ? await res.text() : '');
    } catch {
      // No robots.txt reachable. Treat as disallowed rather than assume permission.
      robotsCache.set(origin, null);
    }
  }
  const body = robotsCache.get(origin);
  if (body === null) return { allowed: false, why: 'robots.txt unreachable' };
  if (body === '') return { allowed: true, why: 'no robots.txt' };

  // Collect rules for our agent, falling back to the wildcard group.
  const groups = [];
  let current = null;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(':');
    const key = (rawKey ?? '').trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') {
      if (!current || current.rules.length > 0) {
        current = { agents: [value.toLowerCase()], rules: [] };
        groups.push(current);
      } else {
        current.agents.push(value.toLowerCase());
      }
    } else if (current && (key === 'disallow' || key === 'allow')) {
      current.rules.push({ allow: key === 'allow', path: value });
    }
  }

  const mine = groups.find((g) => g.agents.some((a) => USER_AGENT.toLowerCase().startsWith(a)));
  const wildcard = groups.find((g) => g.agents.includes('*'));
  const group = mine ?? wildcard;
  if (!group) return { allowed: true, why: 'no applicable group' };

  let best = null;
  for (const rule of group.rules) {
    if (rule.path === '') continue;
    // robots.txt paths are full of regex metacharacters -- `/*?filters[` is a real rule on
    // a real recipe site. Escape everything, then re-enable the two wildcards robots
    // actually defines: `*` for any run of characters and a trailing `$` for end-of-path.
    const pattern = rule.path
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\\\$$/, '$');
    let matches;
    try {
      matches = new RegExp(`^${pattern}`).test(pathname);
    } catch {
      // An unparseable rule is not a licence to crawl; fall back to a prefix comparison.
      matches = pathname.startsWith(rule.path.split('*')[0]);
    }
    if (matches && (!best || rule.path.length > best.path.length)) best = rule;
  }
  if (!best) return { allowed: true, why: 'no matching rule' };
  return { allowed: best.allow, why: `${best.allow ? 'Allow' : 'Disallow'}: ${best.path}` };
}

/**
 * Is this page a recipe at all?
 *
 * Judged from the page's own VISIBLE text, never from its URL and never from its JSON-LD —
 * if the denominator were derived from the thing being measured, the measurement would be
 * circular. A URL-based classifier was tried first and was wrong in both directions: it
 * counted `/about-us/` as a recipe and `allrecipes.com/recipe/...` as not one.
 *
 * A recipe page has an ingredients heading, a method heading, and a plausible number of
 * measured quantities. Index and roundup pages have the words but not the quantities.
 */
function looksLikeRecipePage(html) {
  const visible = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ');
  const hasIngredients = /\bingredients?\b/i.test(visible);
  const hasMethod = /\b(instructions?|directions?|method|preparation|how to make)\b/i.test(visible);
  const quantities = (visible.match(
    /\b\d+(?:[.,/]\d+)?\s*(cups?|tbsp|tablespoons?|tsp|teaspoons?|g|grams?|kg|ml|oz|ounces?|lb|pounds?|cloves?|slices?)\b/gi,
  ) ?? []).length;
  return { isRecipe: hasIngredients && hasMethod && quantities >= 4, quantities };
}

const results = [];
const lastHitByHost = new Map();

for (const url of URLS) {
  const host = new URL(url).host;
  const since = Date.now() - (lastHitByHost.get(host) ?? 0);
  if (since < 3000) await sleep(3000 - since);

  const robots = await allowedByRobots(url);
  if (!robots.allowed) {
    results.push({ url, host, status: 'skipped-robots', detail: robots.why });
    console.log(`  robots   ${host.padEnd(28)} ${robots.why}`);
    continue;
  }

  lastHitByHost.set(host, Date.now());
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      results.push({ url, host, status: `http-${res.status}` });
      console.log(`  http ${res.status} ${host}`);
      continue;
    }
    const html = await res.text();

    const jsonLd = extractJsonLd(html);
    const micro = jsonLd.ok ? { ok: false, reason: 'not attempted' } : extractMicrodata(html);
    const winner = jsonLd.ok ? jsonLd : micro;
    const classified = looksLikeRecipePage(html);

    results.push({
      url,
      host,
      isRecipePage: classified.isRecipe,
      quantityMentions: classified.quantities,
      status: winner.ok ? 'ok' : 'no-markup',
      method: winner.ok ? winner.method : null,
      bytes: html.length,
      jsonLd: jsonLd.ok ? 'hit' : jsonLd.reason,
      microdata: micro.ok ? 'hit' : micro.reason,
      ...(winner.ok
        ? {
            title: winner.recipe.title,
            ingredients: winner.recipe.ingredients.length,
            steps: winner.recipe.instructions.length,
            totalTimeMin: winner.recipe.totalTimeMin ?? null,
            yieldServings: winner.recipe.yieldServings ?? null,
          }
        : {}),
    });
    const mark = !classified.isRecipe
      ? 'not-recipe'
      : winner.ok
        ? winner.method === 'json-ld'
          ? 'JSON-LD  '
          : 'microdata'
        : 'MISS     ';
    console.log(
      `  ${mark} ${host.padEnd(28)} ${
        winner.ok
          ? `${String(winner.recipe.ingredients.length).padStart(2)} ing, ${String(winner.recipe.instructions.length).padStart(2)} steps, ${winner.recipe.totalTimeMin ?? '?'} min`
          : winner.reason
      }`,
    );
  } catch (err) {
    results.push({ url, host, status: 'error', detail: err instanceof Error ? err.message : String(err) });
    console.log(`  error    ${host.padEnd(28)} ${err instanceof Error ? err.message : err}`);
  }
}

const fetched = results.filter((r) => r.status === 'ok' || r.status === 'no-markup');
const recipePages = fetched.filter((r) => r.isRecipePage);
const nonRecipePages = fetched.filter((r) => !r.isRecipePage);
const jsonLdHits = recipePages.filter((r) => r.method === 'json-ld').length;
const microHits = recipePages.filter((r) => r.method === 'microdata').length;
const missedRecipes = recipePages.filter((r) => r.status === 'no-markup');

const summary = {
  measuredAt: new Date().toISOString(),
  urlsTried: URLS.length,
  fetched: fetched.length,
  skippedByRobots: results.filter((r) => r.status === 'skipped-robots').length,
  errors: results.filter((r) => r.status === 'error' || String(r.status).startsWith('http-')).length,
  // The denominator: pages judged to be recipes from their own visible text.
  recipePagesSampled: recipePages.length,
  distinctDomains: new Set(recipePages.map((r) => r.host)).size,
  jsonLdHits,
  microdataHits: microHits,
  missedRecipePages: missedRecipes.map((r) => r.url),
  structuredHitRate: recipePages.length > 0 ? (jsonLdHits + microHits) / recipePages.length : 0,
  // Extracting a recipe from a page that is not one would be worse than missing one.
  nonRecipePagesSampled: nonRecipePages.length,
  falsePositives: nonRecipePages.filter((r) => r.status === 'ok').length,
  carriedTotalTime: `${recipePages.filter((r) => r.totalTimeMin).length}/${jsonLdHits + microHits}`,
  carriedYield: `${recipePages.filter((r) => r.yieldServings).length}/${jsonLdHits + microHits}`,
};

console.log('\n--- summary ---');
console.log(JSON.stringify(summary, null, 2));

const outArg = process.argv.indexOf('--out');
if (outArg > -1 && process.argv[outArg + 1]) {
  writeFileSync(process.argv[outArg + 1], JSON.stringify({ summary, results }, null, 2));
  console.log(`\nwrote ${process.argv[outArg + 1]}`);
}
