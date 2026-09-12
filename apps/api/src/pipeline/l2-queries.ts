import { SearchQueriesSchema, type SearchQueries, type SpokenIntake } from '@kitchen/domain';
import type { StageSpec } from '../llm/gateway';

/**
 * L2 — intake into search queries.
 *
 * Model-first, deliberately. The deterministic version of this stage is "join the wants
 * with the urgent ingredients and add the word recipe", and it produces queries like
 * "stir fry bok choy chicken breast recipe" — which finds pages, but not the right ones.
 * Knowing that someone with bok choy going off and a craving for something comforting
 * should be shown congee is the judgement this stage exists to make.
 *
 * The deterministic join stays as the floor, because a session with no search results is
 * worse than a session with mediocre ones.
 */

const SYSTEM = `You turn a week's batch-cooking intake into web search queries.

Return 3 to 6 queries, best first. Each must be something a person would actually type into
a search engine and get recipe pages back from.

Rules:
- Lead with what they said they WANT. That is the session they asked for.
- Use the ingredients that have to be used up: those are the ones going in the bin otherwise.
- Batch cooking has its own vocabulary — "meal prep", "make ahead", "batch", "freezer" —
  and using it finds recipes that keep and reheat, which is the whole point.
- One idea per query. Do not stuff six ingredients into one.
- Vary them. Six phrasings of the same dish wastes five of the six.
- Include the word "recipe" unless the query already names a dish unambiguously.
- Never invent a dietary restriction or a cuisine they did not mention.`;

/** Enough of a query to find something, when there is no model to build a better one. */
const deterministicQueries = (intake: SpokenIntake): string[] => {
  const urgent = intake.pantry.filter((p) => p.urgency === 'use-today').map((p) => p.said);
  const some = intake.pantry.slice(0, 3).map((p) => p.said);
  const queries = [
    ...intake.wants.slice(0, 3).map((w) => `${w} meal prep recipe`),
    ...(urgent.length > 0 ? [`${urgent.slice(0, 2).join(' ')} recipe`] : []),
    ...(some.length > 0 ? [`batch cooking with ${some.join(' ')}`] : []),
  ].filter((q) => q.trim().length > 0);

  return queries.length > 0 ? queries.slice(0, 6) : ['easy meal prep recipes for the week'];
};

export const l2Queries: StageSpec<SpokenIntake, SearchQueries> = {
  stage: 'L2-query-brief',
  schema: SearchQueriesSchema,
  system: SYSTEM,
  buildUser: (intake) =>
    [
      `They want: ${intake.wants.length > 0 ? intake.wants.join('; ') : '(they did not say)'}`,
      `They have: ${
        intake.pantry.length > 0
          ? intake.pantry
              .map((p) => (p.urgency === 'use-today' ? `${p.said} (going off)` : p.said))
              .join(', ')
          : '(they did not say)'
      }`,
      `Cooking: ${intake.cookCount} ${intake.cookCount === 1 ? 'person' : 'people'}`,
      intake.restrictions.length > 0 ? `Avoiding: ${intake.restrictions.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  fallback: (intake) => SearchQueriesSchema.parse({ queries: deterministicQueries(intake) }),
};
