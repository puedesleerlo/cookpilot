/**
 * robots.txt, honoured.
 *
 * Not a full implementation of the standard — it is the subset that matters when a fetcher
 * reads one page per origin at human speed: find the group that applies to us, collect its
 * disallows, and obey the longest match. Crawl-delay and sitemaps are irrelevant here.
 *
 * It fails OPEN on a missing or unreadable robots.txt and CLOSED on a disallow. A site with
 * no robots.txt has not asked for anything; a site with one has.
 */

export const USER_AGENT =
  'KitchenCompilerBot/0.1 (+https://hackaton-508407.web.app; reads recipe pages a user asked for)';

const TIMEOUT_MS = 5_000;
const MAX_ROBOTS_BYTES = 512 * 1024;

export type RobotsRules = { disallow: string[]; allow: string[] };

/** Parse the `*` group plus any group naming us; ours wins where both exist. */
export const parseRobots = (text: string, agent = 'kitchencompilerbot'): RobotsRules => {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/#.*$/, '').trim());
  const groups: { agents: string[]; allow: string[]; disallow: string[] }[] = [];
  let current: { agents: string[]; allow: string[]; disallow: string[] } | null = null;
  let lastWasAgent = false;

  for (const line of lines) {
    const match = /^([a-zA-Z-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const field = match[1]!.toLowerCase();
    const value = match[2]!.trim();

    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === 'disallow') current.disallow.push(value);
    if (field === 'allow') current.allow.push(value);
  }

  const mine = groups.filter((g) => g.agents.includes(agent));
  const star = groups.filter((g) => g.agents.includes('*'));
  const chosen = mine.length > 0 ? mine : star;

  return {
    disallow: chosen.flatMap((g) => g.disallow).filter((p) => p.length > 0),
    allow: chosen.flatMap((g) => g.allow).filter((p) => p.length > 0),
  };
};

/** Longest matching rule wins; allow beats disallow at equal length, per the standard. */
export const isAllowed = (rules: RobotsRules, pathname: string): boolean => {
  const longest = (patterns: string[]): number =>
    patterns.reduce((best, p) => (pathname.startsWith(p) && p.length > best ? p.length : best), -1);
  const deny = longest(rules.disallow);
  if (deny < 0) return true;
  return longest(rules.allow) >= deny;
};

const cache = new Map<string, RobotsRules>();

export const rulesFor = async (origin: string): Promise<RobotsRules> => {
  const cached = cache.get(origin);
  if (cached) return cached;

  const empty: RobotsRules = { disallow: [], allow: [] };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${origin}/robots.txt`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/plain' },
      signal: controller.signal,
    });
    if (!response.ok) {
      cache.set(origin, empty);
      return empty;
    }
    const text = (await response.text()).slice(0, MAX_ROBOTS_BYTES);
    const rules = parseRobots(text);
    cache.set(origin, rules);
    return rules;
  } catch {
    // No robots.txt, or it could not be read. Nothing has been asked of us.
    cache.set(origin, empty);
    return empty;
  } finally {
    clearTimeout(timer);
  }
};

export const resetRobotsCache = (): void => cache.clear();
