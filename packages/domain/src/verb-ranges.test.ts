import { describe, expect, it } from 'vitest';
import { CookingVerbSchema } from './primitives';
import { VERB_RULES, durationFromText, verbFromText } from './verb-ranges';

/**
 * The verb table is no longer a fallback step generator. Under the consolidated delta it
 * is the plausible-range table the L4 enrichment validator checks model output against,
 * so these tests now guard "is this range defensible", not "does the parser work".
 */
describe('the cooking-verb range table', () => {
  it('covers every verb in the vocabulary', () => {
    for (const verb of CookingVerbSchema.options) {
      expect(VERB_RULES[verb], `missing range for ${verb}`).toBeDefined();
    }
  });

  it('keeps every range internally consistent', () => {
    for (const [verb, rule] of Object.entries(VERB_RULES)) {
      expect(rule.activeMin + rule.finishMin, verb).toBeLessThanOrEqual(rule.durationMin);
      expect(rule.durationMin, verb).toBeGreaterThan(0);
    }
  });

  it('treats high-heat cooking as fully attended and low-heat as mostly free', () => {
    for (const verb of ['sear', 'saute', 'stir-fry', 'fry'] as const) {
      expect(VERB_RULES[verb].activeMin, verb).toBe(VERB_RULES[verb].durationMin);
    }
    for (const verb of ['simmer', 'braise', 'steam', 'steep'] as const) {
      const r = VERB_RULES[verb];
      expect(r.durationMin - r.activeMin - r.finishMin, verb).toBeGreaterThan(r.activeMin);
    }
  });

  it('holds equipment through the passive stretch only where it really is held', () => {
    expect(VERB_RULES.simmer.equipment.every((e) => e.heldThroughHold)).toBe(true);
    expect(VERB_RULES.chop.equipment.every((e) => e.heldThroughHold)).toBe(false);
  });

  it('gives the validator something to reject an implausible claim with', () => {
    // The failure this table exists to catch: a model saying rice cooks in three minutes.
    expect(VERB_RULES.simmer.durationMin).toBeGreaterThanOrEqual(15);
    expect(VERB_RULES.boil.durationMin).toBeGreaterThanOrEqual(5);
  });

  it('reads a verb and a stated duration out of instruction text', () => {
    expect(verbFromText('Bring to a boil, then reduce')).toBe('boil');
    expect(verbFromText('Finely mince the garlic')).toBe('mince');
    expect(durationFromText('Simmer for 25 minutes')).toBe(25);
    expect(durationFromText('Chill for 1 hour 30 minutes')).toBe(90);
    expect(durationFromText('Stir until combined')).toBeNull();
  });
});
