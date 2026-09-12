## Context

The delta requires the JSON-LD hit rate to be measured on at least twenty real URLs before
the ingestion worker is designed, because that one number decides the shape of everything
downstream. If structured markup is usually there, extraction is free, instant,
deterministic and reproducible, and the model is an edge case. If it is usually absent, the
model is on the hot path and the cost and latency model changes completely.

So it was measured rather than assumed. `scripts/measure-extraction.mjs` is the instrument.

## The measurement

Run 2026-09-12 against live sites, honouring robots.txt, identifying the bot with a
contact URL, one request per domain at a time with a three-second gap.

| | |
|---|---|
| URLs attempted | 56 |
| Pages fetched | 44 |
| Skipped by robots.txt | 1 (`taste.com.au`, `Disallow: /`) |
| HTTP errors (404 / 403 / 410) | 11 |
| **Recipe pages sampled** | **27**, across **13 distinct domains** |
| **JSON-LD hits** | **27** |
| Microdata hits | 0 (never needed) |
| **Recipe pages missed** | **0** |
| Non-recipe pages sampled | 17 |
| Recipes extracted from a non-recipe page | 0 |
| Hits carrying a machine-readable total time | 23 / 27 |
| Hits carrying a machine-readable yield | 27 / 27 |

Domains: allrecipes, seriouseats, bbcgoodfood, simplyrecipes, budgetbytes, delish,
recipetineats, bonappetit, food.com, minimalistbaker, kingarthurbaking, cookieandkate,
tasteofhome.

**Hit rate on recipe pages: 100%.**

### How the denominator was established, and why that took three attempts

This is the part worth recording, because the first two numbers were wrong and both were
wrong in a flattering-then-unflattering direction.

**Attempt 1 — hand-written URLs.** Eleven of twenty 404'd. They were plausible-looking URLs
that no longer resolve, so the sample was whatever happened to survive. Hit rate 9/9, on a
sample too small and too self-selected to mean anything.

**Attempt 2 — discovered URLs, denominator = everything fetched.** 47%. Every single
"miss" turned out to be `/feed/`, `/wp-json/`, `/about-us/` or a category index — pages the
extractor correctly reported as containing no recipe. That number measured my URL filter,
not the extractor.

**Attempt 3 — discovered URLs, denominator = pages judged to be recipes from their own
visible text.** A URL-based classifier was tried and was wrong in both directions: it
counted `/about/a26446372/about-us-…/` as a recipe and `allrecipes.com/recipe/223042/…` as
not one. The classifier that stands reads the page's *rendered text* — an ingredients
heading, a method heading, and at least four measured quantities — and deliberately never
looks at the URL or at the JSON-LD, because deriving the denominator from the thing being
measured is circular.

One page the conservative classifier excluded (Delish, *Eggs Benedict Hash Brown Bites*,
three measured quantities rather than four) is a real recipe, and the extractor handled it
correctly. Counting it, the result is 28 of 28.

## Goals / Non-Goals

**Goals:**
- Deterministic extraction as the primary path, with the model reserved for what is left.
- Survive the shapes real sites emit, not the shape the specification describes.
- Never store source prose; keep the pointer and the attribution.
- Crawl politely enough that nobody has to ask us to stop.

**Non-Goals:**
- Rendering JavaScript. Every page in the sample served its JSON-LD in the initial HTML.
- Extracting nutrition, reviews or images beyond a single hero URL.
- Perfect microdata support. It earned zero hits in the sample and exists as a safety net.

## Decisions

### Order: JSON-LD, then microdata, then the model

Measured, not assumed. JSON-LD alone covered every recipe page in the sample, so microdata
is a safety net and the model is an edge case. `ingestion_jobs.method` records which path
produced each result — if the `llm` share ever climbs, that is a fact about our extractor
being weak, not about the web having changed.

### Every real-world shape, because every one of them appeared

`recipeInstructions` arrives as a bare string, an array of strings, an array of `HowToStep`,
or a `HowToSection` wrapping `itemListElement`. `@type` arrives as a string or an array.
The Recipe node sits at the top level, inside `@graph`, or under `mainEntity`. Durations
arrive as ISO 8601 or occasionally as `"45 mins"` in a field that should be ISO 8601. All
of that is handled, and all of it came from pages in the sample rather than from
imagination.

### Durations are checked against the plausible-range table

The verb table repurposed in `add-monorepo-and-shared-domain` is a table of defensible
durations per cooking verb. Extracted step times are checked against it: a page claiming a
three-minute risotto is corrected to the table's conservative value rather than scheduled.
Structured markup is machine-readable, which is not the same as true.

### Prose is read and discarded

Instruction text is used to infer a verb, a duration and equipment, and is then thrown
away. What the user sees is our own wording. `source: { url, siteName, retrievedAt }` is
kept and displayed, and the recipe links out. This is both the legally clean path and the
engineering-correct one — prose does not schedule.

### Crawling manners

robots.txt is honoured with a longest-match rule, a missing or unreachable robots.txt is
treated as *disallowed* rather than as permission, the bot identifies itself with a contact
URL, and requests to one domain are serialised with a delay. Writing the robots parser
turned up a real bug worth noting: robots paths are full of regex metacharacters —
`/*?filters[` is a live rule on a real recipe site — so pattern translation escapes
everything first and then re-enables only the two wildcards robots actually defines.

## Risks / Trade-offs

- **100% is a small-sample result.** Thirteen domains, weighted toward sites that rank well
  and therefore have every incentive to publish rich-results markup. The real corpus will
  include blogs that do not. The design does not depend on the number staying at 100% — it
  depends on it being high enough that the model is not on the hot path, and 27/27 is
  comfortably that.
- **Three sites refused the bot outright** (403) and one disallows crawling entirely. That
  is their right, and the honest consequence is that those sites are not ingestible. A user
  can still paste the text.
- **The text-based recipe classifier is conservative** and excluded one real recipe. For
  measuring a denominator that is the right direction to err.
- **No JavaScript rendering.** If a site moves its markup behind hydration, it moves from
  the deterministic path to the model path and the `method` metric will show it.
