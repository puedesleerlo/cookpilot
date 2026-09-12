import { describe, expect, it } from 'vitest';
import { LEXICON, defaultUrgency, resolveIngredient, searchLexicon } from './lexicon';

/**
 * The lexicon is a dictionary, and these tests exist mostly to keep it one. The deleted
 * free-text intake would have been rebuilt accidentally the first time someone pointed
 * `searchLexicon` at a sentence, so the boundary is written down here as well as in prose.
 */

describe('searching for autocomplete', () => {
  it('finds an ingredient by the name it is known by', () => {
    expect(searchLexicon('bok').map((m) => m.entry.canonicalName)).toContain('bok choy');
  });

  it('finds it by a name the user actually says', () => {
    const hit = searchLexicon('scallion')[0];
    expect(hit?.entry.canonicalName).toBe('spring onions');
    expect(hit?.matched).toContain('scallion');
  });

  it('puts what you started typing above what merely contains it', () => {
    const names = searchLexicon('chick').map((m) => m.entry.canonicalName);
    expect(names[0]).toBe('chicken breast');
  });

  it('offers the general thing before the specific one', () => {
    const names = searchLexicon('rice').map((m) => m.entry.canonicalName);
    expect(names.indexOf('jasmine rice')).toBeLessThan(names.indexOf('cooking wine'));
  });

  it('returns nothing for nothing', () => {
    expect(searchLexicon('')).toEqual([]);
    expect(searchLexicon('   ')).toEqual([]);
  });

  it('offers each ingredient once, however many of its names match', () => {
    const names = searchLexicon('pepper').map((m) => m.entry.canonicalName);
    expect(new Set(names).size).toBe(names.length);
  });

  it('stays within the limit it was given', () => {
    expect(searchLexicon('a', 3).length).toBeLessThanOrEqual(3);
  });

  it('is a lookup, not a parser: a sentence matches nothing', () => {
    // The deleted L1 fallback is exactly what this would become if it segmented input.
    expect(searchLexicon('some chicken and rice for four people')).toEqual([]);
  });
});

describe('the urgency an ingredient arrives with', () => {
  it('treats fish and raw meat as today', () => {
    expect(defaultUrgency(1)).toBe('use-today');
    expect(defaultUrgency(2)).toBe('use-today');
  });

  it('treats a week as soon and a month as neither', () => {
    expect(defaultUrgency(7)).toBe('use-soon');
    expect(defaultUrgency(14)).toBe('use-soon');
    expect(defaultUrgency(30)).toBe('not-urgent');
  });

  it('never guesses today for something it has never heard of', () => {
    expect(defaultUrgency(undefined)).toBe('use-soon');
  });

  it('agrees with the lexicon about the demo pantry', () => {
    const keeps = (name: string): number | undefined =>
      LEXICON.find((e) => e.canonicalName === name)?.keepsDays;
    expect(defaultUrgency(keeps('salmon'))).toBe('use-today');
    expect(defaultUrgency(keeps('chicken breast'))).toBe('use-today');
    expect(defaultUrgency(keeps('jasmine rice'))).toBe('not-urgent');
    expect(defaultUrgency(keeps('soy sauce'))).toBe('not-urgent');
  });
});

describe('resolving a term the search offered', () => {
  it('keeps what it does not know rather than substituting something close', () => {
    const unknown = resolveIngredient('yu choy');
    expect(unknown.unrecognised).toBe(true);
    expect(unknown.canonicalName).toBe('yu choy');
    expect(unknown.canonicalName).not.toBe('bok choy');
  });
});
