import type { CookingVerb, EquipmentKind, SkillLevel, TaskClass } from './primitives';
import { CookingVerbSchema, type Effort } from './primitives';

/**
 * The cooking-verb rule table.
 *
 * This is why Kitchen Compiler works with no API key at all. Given only a verb, it yields
 * a plausible, internally consistent, schedulable step: how long it takes, how much of
 * that is hands-on, what it occupies while it runs, who may be handed it, and how tiring
 * it is. Stage L3's fallback parser reads from here, and so does L4's.
 *
 * The line that matters most is the active/passive split. High-heat cooking is fully
 * attended — searing is eight minutes of a cook, not eight minutes of a pan. Low-heat
 * cooking is not: a simmer is one minute of a cook and eighteen of a saucepan, and that
 * asymmetry is where every minute of parallelism in this product comes from.
 */
export type VerbRule = {
  durationMin: number;
  activeMin: number;
  finishMin: number;
  equipment: { kind: EquipmentKind; heldThroughHold: boolean }[];
  taskClass: TaskClass;
  minSkill: SkillLevel;
  effort: Effort;
};

const held = (...kinds: EquipmentKind[]) => kinds.map((kind) => ({ kind, heldThroughHold: true }));
const tool = (...kinds: EquipmentKind[]) => kinds.map((kind) => ({ kind, heldThroughHold: false }));

export const VERB_RULES: Record<CookingVerb, VerbRule> = {
  // ---------------------------------------------------------------- prep
  wash: { durationMin: 4, activeMin: 4, finishMin: 0, equipment: tool('colander', 'sink'), taskClass: 'wash-produce', minSkill: 'beginner', effort: 1 },
  peel: { durationMin: 4, activeMin: 4, finishMin: 0, equipment: tool('cutting-board', 'knife'), taskClass: 'knife-work', minSkill: 'beginner', effort: 2 },
  chop: { durationMin: 5, activeMin: 5, finishMin: 0, equipment: tool('cutting-board', 'knife'), taskClass: 'knife-work', minSkill: 'intermediate', effort: 2 },
  slice: { durationMin: 4, activeMin: 4, finishMin: 0, equipment: tool('cutting-board', 'knife'), taskClass: 'knife-work', minSkill: 'intermediate', effort: 2 },
  dice: { durationMin: 5, activeMin: 5, finishMin: 0, equipment: tool('cutting-board', 'knife'), taskClass: 'knife-work', minSkill: 'intermediate', effort: 2 },
  mince: { durationMin: 3, activeMin: 3, finishMin: 0, equipment: tool('cutting-board', 'knife'), taskClass: 'knife-work', minSkill: 'intermediate', effort: 2 },
  grate: { durationMin: 3, activeMin: 3, finishMin: 0, equipment: tool('grater', 'mixing-bowl'), taskClass: 'knife-work', minSkill: 'beginner', effort: 2 },

  // ------------------------------------------------------------ combining
  marinate: { durationMin: 20, activeMin: 3, finishMin: 0, equipment: held('mixing-bowl'), taskClass: 'marinate', minSkill: 'beginner', effort: 1 },
  season: { durationMin: 1, activeMin: 1, finishMin: 0, equipment: [], taskClass: 'season-taste', minSkill: 'intermediate', effort: 1 },
  mix: { durationMin: 3, activeMin: 3, finishMin: 0, equipment: tool('mixing-bowl'), taskClass: 'mix', minSkill: 'beginner', effort: 1 },
  whisk: { durationMin: 3, activeMin: 3, finishMin: 0, equipment: tool('mixing-bowl'), taskClass: 'mix', minSkill: 'beginner', effort: 2 },
  knead: { durationMin: 8, activeMin: 8, finishMin: 0, equipment: tool('mixing-bowl'), taskClass: 'mix', minSkill: 'intermediate', effort: 3 },

  // ------------------------------------------------- high heat: attended
  sear: { durationMin: 8, activeMin: 8, finishMin: 0, equipment: held('frying-pan', 'burner'), taskClass: 'stovetop', minSkill: 'intermediate', effort: 3 },
  saute: { durationMin: 7, activeMin: 7, finishMin: 0, equipment: held('frying-pan', 'burner'), taskClass: 'stovetop', minSkill: 'intermediate', effort: 3 },
  'stir-fry': { durationMin: 6, activeMin: 6, finishMin: 0, equipment: held('frying-pan', 'burner'), taskClass: 'stovetop', minSkill: 'intermediate', effort: 3 },
  fry: { durationMin: 8, activeMin: 8, finishMin: 0, equipment: held('frying-pan', 'burner'), taskClass: 'stovetop', minSkill: 'confident', effort: 3 },
  grill: { durationMin: 12, activeMin: 12, finishMin: 0, equipment: held('sheet-pan', 'oven-rack'), taskClass: 'oven', minSkill: 'intermediate', effort: 3 },
  toast: { durationMin: 4, activeMin: 2, finishMin: 1, equipment: held('frying-pan', 'burner'), taskClass: 'stovetop', minSkill: 'beginner', effort: 1 },

  // -------------------------------------------------- low heat: unattended
  boil: { durationMin: 10, activeMin: 2, finishMin: 1, equipment: held('saucepan', 'burner'), taskClass: 'boil-water', minSkill: 'beginner', effort: 1 },
  simmer: { durationMin: 20, activeMin: 1, finishMin: 1, equipment: held('saucepan', 'burner'), taskClass: 'simmer-watch', minSkill: 'beginner', effort: 1 },
  steam: { durationMin: 8, activeMin: 1, finishMin: 1, equipment: held('pot', 'burner'), taskClass: 'simmer-watch', minSkill: 'beginner', effort: 1 },
  braise: { durationMin: 35, activeMin: 3, finishMin: 2, equipment: held('pot', 'burner'), taskClass: 'simmer-watch', minSkill: 'intermediate', effort: 2 },
  reduce: { durationMin: 10, activeMin: 2, finishMin: 1, equipment: held('saucepan', 'burner'), taskClass: 'simmer-watch', minSkill: 'intermediate', effort: 2 },
  roast: { durationMin: 25, activeMin: 3, finishMin: 2, equipment: held('sheet-pan', 'oven-rack'), taskClass: 'oven', minSkill: 'intermediate', effort: 2 },
  bake: { durationMin: 30, activeMin: 2, finishMin: 2, equipment: held('sheet-pan', 'oven-rack'), taskClass: 'oven', minSkill: 'intermediate', effort: 2 },

  // ------------------------------------------------------ waiting and cold
  rest: { durationMin: 5, activeMin: 0, finishMin: 0, equipment: [], taskClass: 'chill', minSkill: 'beginner', effort: 1 },
  cool: { durationMin: 12, activeMin: 0, finishMin: 0, equipment: [], taskClass: 'chill', minSkill: 'beginner', effort: 1 },
  chill: { durationMin: 20, activeMin: 2, finishMin: 0, equipment: held('storage-container', 'fridge-shelf'), taskClass: 'chill', minSkill: 'beginner', effort: 1 },
  freeze: { durationMin: 30, activeMin: 2, finishMin: 0, equipment: held('storage-container', 'freezer-shelf'), taskClass: 'chill', minSkill: 'beginner', effort: 1 },
  thaw: { durationMin: 25, activeMin: 1, finishMin: 0, equipment: held('mixing-bowl'), taskClass: 'chill', minSkill: 'beginner', effort: 1 },

  // -------------------------------------------------------------- drinks
  steep: { durationMin: 15, activeMin: 1, finishMin: 1, equipment: held('jar'), taskClass: 'steep', minSkill: 'beginner', effort: 1 },
  brew: { durationMin: 6, activeMin: 2, finishMin: 1, equipment: held('kettle', 'burner'), taskClass: 'boil-water', minSkill: 'beginner', effort: 1 },
  infuse: { durationMin: 20, activeMin: 2, finishMin: 1, equipment: held('pitcher'), taskClass: 'steep', minSkill: 'beginner', effort: 1 },
  juice: { durationMin: 5, activeMin: 5, finishMin: 0, equipment: tool('measuring-cup'), taskClass: 'strain', minSkill: 'beginner', effort: 2 },
  blend: { durationMin: 3, activeMin: 3, finishMin: 0, equipment: tool('blender'), taskClass: 'blend', minSkill: 'beginner', effort: 2 },
  strain: { durationMin: 3, activeMin: 3, finishMin: 0, equipment: tool('colander', 'mixing-bowl'), taskClass: 'strain', minSkill: 'beginner', effort: 1 },

  // ------------------------------------------------------------ finishing
  portion: { durationMin: 6, activeMin: 6, finishMin: 0, equipment: tool('storage-container'), taskClass: 'portion', minSkill: 'beginner', effort: 1 },
  label: { durationMin: 2, activeMin: 2, finishMin: 0, equipment: [], taskClass: 'label', minSkill: 'beginner', effort: 1 },
  assemble: { durationMin: 5, activeMin: 5, finishMin: 0, equipment: tool('mixing-bowl'), taskClass: 'assemble', minSkill: 'beginner', effort: 1 },
  garnish: { durationMin: 2, activeMin: 2, finishMin: 0, equipment: [], taskClass: 'garnish', minSkill: 'beginner', effort: 1 },
  'wash-up': { durationMin: 3, activeMin: 3, finishMin: 0, equipment: tool('sink'), taskClass: 'wash-up', minSkill: 'beginner', effort: 2 },
};

/** Verb synonyms seen in real recipe text, mapped onto the canonical vocabulary. */
const SYNONYMS: Record<string, CookingVerb> = {
  cut: 'chop', cube: 'dice', julienne: 'slice', shred: 'grate', crush: 'mince', smash: 'mince',
  combine: 'mix', stir: 'mix', fold: 'mix', toss: 'mix', beat: 'whisk',
  brown: 'sear', char: 'sear', 'pan-fry': 'saute', sweat: 'saute', 'deep-fry': 'fry',
  'bring to a boil': 'boil', blanch: 'boil', poach: 'simmer', stew: 'braise',
  'set aside': 'rest', refrigerate: 'chill', 'let cool': 'cool', defrost: 'thaw',
  soak: 'steep', 'cold brew': 'steep', puree: 'blend', 'whizz': 'blend', sieve: 'strain',
  divide: 'portion', 'pack': 'portion', plate: 'assemble', 'top with': 'garnish',
  rinse: 'wash', 'pat dry': 'wash', 'preheat': 'bake',
};

/** Best-effort verb identification from a line of instruction text. */
export const verbFromText = (line: string): CookingVerb => {
  const lower = line.toLowerCase();
  for (const [phrase, verb] of Object.entries(SYNONYMS)) {
    if (lower.includes(phrase)) return verb;
  }
  for (const verb of CookingVerbSchema.options) {
    if (new RegExp(`\\b${verb.replace('-', '[- ]?')}(e?s|ing|ed)?\\b`).test(lower)) return verb;
  }
  return 'mix';
};

/** "simmer for 25 minutes" -> 25. "1 hour" -> 60. Returns null when the text says nothing. */
export const durationFromText = (line: string): number | null => {
  const hours = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i.exec(line);
  const mins = /(\d+)\s*(?:minutes?|mins?|m)\b/i.exec(line);
  const total = (hours ? Math.round(parseFloat(hours[1]!) * 60) : 0) + (mins ? parseInt(mins[1]!, 10) : 0);
  return total > 0 ? total : null;
};
