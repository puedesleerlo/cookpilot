import {
  servingsPerDish,
  type RecipeIR,
  type SpokenIntake,
} from '@kitchen/domain';
import { toRecipeFromModel } from '@kitchen/recipes';
import type { Gateway } from '../llm/gateway';
import type { BraveProvider } from '../providers/brave';
import { searchWeb, type SearchHit } from '../search/brave';
import { fetchPage } from '../search/page';
import { l1Intake } from './l1-intake';
import { l2Queries } from './l2-queries';
import { l3Recipe } from './l3-recipe';

/**
 * The chain, from two spoken answers to recipes the scheduler can hold.
 *
 * Pages are fetched and read one at a time. An earlier version did three at once and was
 * faster until it was not: a shared Vertex quota started answering 429, and the cost of a
 * dropped page is a recipe missing from somebody's week. Sequential is also the polite way
 * to read four pages from four strangers' servers.
 *
 * The shape worth noticing is that nothing here is allowed to fail the whole run. A search
 * that returns nothing, a page that times out, a page that turns out to be a round-up —
 * all of them are ordinary. The run collects what worked and reports what did not, because
 * a session with four recipes and a note about the two that were unreadable is useful, and
 * an error page is not.
 *
 * What it will not do is fill a gap with something invented. A page that could not be read
 * is dropped, never turned into a recipe with plausible-looking timings, because the user
 * finds out about invented timings in the kitchen with the pan already hot.
 */

export type PipelineNote = { stage: string; message: string };

export type PipelineResult = {
  intake: SpokenIntake;
  recipes: RecipeIR[];
  queries: string[];
  /** Per-recipe fixes the mapper had to make — a duration outside its verb's range. */
  corrections: string[];
  /** Anything that degraded or was dropped, in the order it happened. */
  notes: PipelineNote[];
  /** Portions this session is aiming at: seven days for the people cooking. */
  portionTarget: number;
};

export type RunOptions = {
  gateway: Gateway;
  brave: BraveProvider;
  wantsTranscript: string;
  pantryTranscript: string;
  /** How many recipes to try to come back with. */
  wantRecipes?: number;
};

/** Sites that never carry a single recipe, so fetching them only spends time. */
const NEVER_A_RECIPE =
  /(^|\.)(pinterest\.|youtube\.|youtu\.be|facebook\.|instagram\.|tiktok\.|reddit\.|amazon\.|x\.com|twitter\.)/i;

const usable = (hit: SearchHit): boolean => !NEVER_A_RECIPE.test(hit.siteName);

/** Words that say nothing about which dish this is. */
const FILLER = new Set([
  'the', 'a', 'an', 'and', 'with', 'in', 'for', 'of', 'easy', 'quick', 'simple', 'best',
  'super', 'healthy', 'homemade', 'recipe', 'recipes', 'meal', 'prep', 'low', 'carb',
  'one', 'pan', 'pot', 'minute', 'style', 'my', 'our',
]);

const dishWords = (title: string): Set<string> =>
  new Set(
    title
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !FILLER.has(word)),
  );

/**
 * Is this the dish we already have, under a different headline?
 *
 * Exact title matching caught nothing useful: the same dinner comes back as "Chicken Bok
 * Choy Stir-Fry", "Bok Choy Chicken" and "Easy Low Carb Chicken and Bok Choy", which share
 * no title but are one meal. Comparing the words that actually name a dish — with the SEO
 * filler removed — catches all three.
 */
export const tooSimilar = (a: string, b: string): boolean => {
  const left = dishWords(a);
  const right = dishWords(b);
  if (left.size === 0 || right.size === 0) return false;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / Math.min(left.size, right.size) >= 0.6;
};

export const runPipeline = async (options: RunOptions): Promise<PipelineResult> => {
  const { gateway, brave, wantsTranscript, pantryTranscript } = options;
  const wantRecipes = options.wantRecipes ?? 6;
  const notes: PipelineNote[] = [];

  // ---- L1: two transcripts into structured intake -------------------------
  const intakeResult = await gateway(l1Intake, { wantsTranscript, pantryTranscript });
  if (intakeResult.source === 'fallback') {
    notes.push({ stage: 'L1-intake', message: intakeResult.reason ?? 'the recording could not be read' });
  }
  const intake = intakeResult.value;

  // ---- L2: intake into queries -------------------------------------------
  const queryResult = await gateway(l2Queries, intake);
  if (queryResult.source === 'fallback') {
    notes.push({
      stage: 'L2-query-brief',
      message: `${queryResult.reason ?? 'queries were not written by a model'}; searched on the obvious terms instead`,
    });
  }
  const queries = queryResult.value.queries;

  /*
   * Search each query into its own bucket rather than one flat list.
   *
   * The first version pooled every result and read the best ones, and came back with
   * "Chicken Bok Choy Stir-Fry", "Chicken and Bok Choy Stir Fry", "Bok Choy Chicken" and
   * "Easy Low Carb Chicken and Bok Choy" — four readings of the same dinner. Search
   * converges: five queries about chicken and bok choy return substantially the same pages,
   * ranked slightly differently. A week of meals needs variety, and the queries already
   * encode it, so the fix is to honour them: one recipe per query, taken in turn.
   */
  const seen = new Set<string>();
  const buckets: SearchHit[][] = [];
  for (const query of queries) {
    const found = await searchWeb(brave, query, 8);
    if (!found.ok) {
      notes.push({ stage: 'search', message: `"${query}": ${found.reason}` });
      continue;
    }
    const bucket = found.hits.filter((hit) => {
      if (seen.has(hit.url) || !usable(hit)) return false;
      seen.add(hit.url);
      return true;
    });
    if (bucket.length > 0) buckets.push(bucket);
  }

  const candidates = buckets.flat();
  if (candidates.length === 0) {
    notes.push({ stage: 'search', message: 'nothing came back to read' });
    return { intake, recipes: [], queries, corrections: [], notes, portionTarget: 0 };
  }

  /*
   * Servings are set before extraction because scaling is the model's job, not
   * multiplication afterwards: doubling a stir-fry adds a second batch, doubling a tray
   * bake changes nothing. So we commit to a dish count now — what we are trying to come
   * back with — and scale every recipe to that.
   */
  const target = servingsPerDish(intake.cookCount, wantRecipes);

  /*
   * Read the queries in parallel, each query's pages in turn.
   *
   * The two axes pull in opposite directions. Within one query the pages must be tried in
   * order and stopped at the first that reads, or four results for the same search become
   * four versions of the same dinner. Across queries there is no such constraint, and doing
   * them one after another made a run take three minutes — long enough that the honest
   * thing to put on screen would have been an apology.
   *
   * The burst this creates is what produced 429s before; the generator now backs off and
   * retries, which is the right place to solve it.
   */
  const recipes: RecipeIR[] = [];
  const corrections: string[] = [];
  const claimed = new Set<string>();

  const readOne = async (hit: SearchHit): Promise<RecipeIR | null> => {
    const outcome = await fetchPage(hit.url);
    if (!outcome.ok) {
      notes.push({ stage: 'fetch', message: `${hit.siteName}: ${outcome.reason}` });
      return null;
    }

    const read = await gateway(l3Recipe, { page: outcome.page, targetServings: target });
    if (read.source === 'fallback') {
      notes.push({ stage: 'L3-normalize', message: `${hit.siteName}: ${read.reason ?? 'could not be read'}` });
      return null;
    }

    const mapped = toRecipeFromModel(read.value, {
      url: outcome.page.url,
      siteName: outcome.page.siteName,
    });
    if (!mapped.ok) {
      notes.push({ stage: 'L3-normalize', message: `${hit.siteName}: ${mapped.reason}` });
      return null;
    }

    /*
     * Claim the dish before anyone else can.
     *
     * Queries run concurrently, so two of them can finish reading the same dinner within a
     * few milliseconds of each other. Checking the published list would let both through;
     * checking and claiming in one synchronous step — no await between them — cannot.
     */
    const title = mapped.recipe.title.toLowerCase();
    const clash = [...claimed].find((seenTitle) => tooSimilar(seenTitle, title));
    if (clash) {
      notes.push({
        stage: 'L3-normalize',
        message: `${hit.siteName}: "${mapped.recipe.title}" is the same dish as one already found`,
      });
      return null;
    }
    claimed.add(title);

    for (const c of mapped.corrections) corrections.push(`${mapped.recipe.title} — ${c}`);
    return mapped.recipe;
  };

  /** One query: try its results in order, stop at the first that yields a recipe. */
  const ATTEMPTS_PER_QUERY = 3;
  const fromBucket = async (bucket: SearchHit[]): Promise<RecipeIR | null> => {
    for (const hit of bucket.slice(0, ATTEMPTS_PER_QUERY)) {
      const recipe = await readOne(hit);
      if (recipe) return recipe;
    }
    return null;
  };

  const firstPass = await Promise.all(buckets.map(fromBucket));
  for (const recipe of firstPass) {
    if (recipe && recipes.length < wantRecipes) recipes.push(recipe);
  }

  // Short of the target: go back for seconds, from the deepest results not yet tried.
  if (recipes.length < wantRecipes) {
    const leftovers = buckets.flatMap((b) => b.slice(ATTEMPTS_PER_QUERY));
    for (const hit of leftovers) {
      if (recipes.length >= wantRecipes) break;
      const recipe = await readOne(hit);
      if (recipe) recipes.push(recipe);
    }
  }

  if (recipes.length < wantRecipes) {
    notes.push({
      stage: 'summary',
      message: `read ${recipes.length} of the ${wantRecipes} recipes this session was aiming for`,
    });
  }

  return {
    intake,
    recipes,
    queries,
    corrections,
    notes,
    portionTarget: recipes.length * target,
  };
};
