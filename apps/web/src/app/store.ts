import { create } from 'zustand';
import {
  IngredientSchema,
  defaultUrgency,
  ingredientId,
  resolveIngredient,
  type Allergen,
  type Ingredient,
  type Urgency,
} from '@kitchen/domain';
import { compileSession, type CompileOutcome } from './compile';
import { demoIntake } from './demo';

/**
 * The session store.
 *
 * What is *not* here is the point: no interview logic and no slot-question policy. Under
 * the consolidated delta the API owns question order, so the client holds the answers and
 * the screen it is on, and nothing that could disagree with the server about what to ask
 * next.
 *
 * The intake shape below is what the structured form fills in and what the voice agent's
 * `record_intake` turns resolve to — deliberately identical, so a form answer and a spoken
 * answer produce the same `Constraints`.
 */

export type Screen = 'landing' | 'intake' | 'crew' | 'plans' | 'timeline' | 'cooking' | 'summary';

/** Whether a value came from the user or was assumed on their behalf. */
export type Provenance = 'stated' | 'assumed';
export type Answer<T> = { value: T; source: Provenance };

export type EquipmentAnswer = { kind: string; count: number };

export type IntakeAnswers = {
  pantry: Ingredient[];
  timeBudgetMin: Answer<number>;
  servings: Answer<number>;
  mealCount: Answer<number>;
  cookCount: Answer<number>;
  equipment: Answer<EquipmentAnswer[]>;
  restrictions: Answer<Allergen[]>;
  style: Answer<string>;
  wantsBeverages: Answer<boolean>;
};

/**
 * The standard small kitchen, used until someone says otherwise.
 *
 * Deliberately generous about the dull things. The previous list stopped at the two pans
 * and left out the pot, the colander and the measuring cup, and since a recipe needing
 * equipment the kitchen does not have is not a candidate at all, the same fridge that
 * compiles to six dishes compiled to two — silently, with no way to tell that a missing
 * sieve was the reason. Assuming someone owns a pot is a much smaller sin than that.
 *
 * The blender is the one deliberate omission: plenty of kitchens genuinely do not have one,
 * and it is one tap away in the checklist.
 */
export const DEFAULT_EQUIPMENT: EquipmentAnswer[] = [
  { kind: 'burner', count: 2 },
  { kind: 'frying-pan', count: 1 },
  { kind: 'saucepan', count: 1 },
  { kind: 'pot', count: 1 },
  { kind: 'cutting-board', count: 2 },
  { kind: 'knife', count: 2 },
  { kind: 'mixing-bowl', count: 3 },
  { kind: 'colander', count: 1 },
  { kind: 'grater', count: 1 },
  { kind: 'measuring-cup', count: 1 },
  { kind: 'jar', count: 2 },
  { kind: 'pitcher', count: 1 },
  { kind: 'storage-container', count: 8 },
  { kind: 'fridge-shelf', count: 1 },
  { kind: 'sink', count: 1 },
];

/**
 * Everything the intake can offer, in the order the checklist shows it. A kind absent from
 * `DEFAULT_EQUIPMENT` starts unchecked; the rest are assumptions to be corrected.
 */
export const OFFERED_EQUIPMENT: { kind: string; label: string; count: number }[] = [
  { kind: 'burner', label: 'Burners', count: 2 },
  { kind: 'oven-rack', label: 'Oven', count: 1 },
  { kind: 'frying-pan', label: 'Frying pan', count: 1 },
  { kind: 'saucepan', label: 'Saucepan', count: 1 },
  { kind: 'pot', label: 'Big pot', count: 1 },
  { kind: 'wok', label: 'Wok', count: 1 },
  { kind: 'sheet-pan', label: 'Sheet pan', count: 1 },
  { kind: 'kettle', label: 'Kettle', count: 1 },
  { kind: 'cutting-board', label: 'Chopping boards', count: 2 },
  { kind: 'knife', label: 'Knives', count: 2 },
  { kind: 'mixing-bowl', label: 'Mixing bowls', count: 3 },
  { kind: 'colander', label: 'Colander', count: 1 },
  { kind: 'grater', label: 'Grater', count: 1 },
  { kind: 'measuring-cup', label: 'Measuring cup', count: 1 },
  { kind: 'blender', label: 'Blender', count: 1 },
  { kind: 'jar', label: 'Jars', count: 2 },
  { kind: 'pitcher', label: 'Jug', count: 1 },
  { kind: 'storage-container', label: 'Containers', count: 8 },
  { kind: 'fridge-shelf', label: 'Fridge shelf', count: 1 },
  { kind: 'freezer-shelf', label: 'Freezer shelf', count: 1 },
  { kind: 'sink', label: 'Sink', count: 1 },
];

const assumed = <T>(value: T): Answer<T> => ({ value, source: 'assumed' });

export const URGENCY_CYCLE: Record<Urgency, Urgency> = {
  'use-today': 'use-soon',
  'use-soon': 'not-urgent',
  'not-urgent': 'use-today',
};

/** What each urgency is called on screen. Deadlines, not enum members. */
export const URGENCY_LABEL: Record<Urgency, string> = {
  'use-today': 'has to go today',
  'use-soon': 'this week',
  'not-urgent': 'keeps',
};

export const emptyIntake = (): IntakeAnswers => ({
  pantry: [],
  timeBudgetMin: assumed(60),
  servings: assumed(4),
  mealCount: assumed(3),
  cookCount: assumed(1),
  equipment: assumed([...DEFAULT_EQUIPMENT]),
  restrictions: assumed([]),
  style: assumed('balanced'),
  wantsBeverages: assumed(true),
});

export type SessionState = {
  screen: Screen;
  intake: IntakeAnswers;
  /** The last compile. Null until one has been run. */
  outcome: CompileOutcome | null;
  /** True while the compile curtain is up, which is theatre, not latency. */
  compiling: boolean;

  goTo: (screen: Screen) => void;
  setPantry: (pantry: Ingredient[]) => void;
  addIngredient: (ingredient: Ingredient) => void;
  /** Add by name, resolved through the lexicon. Returns false if it was already there. */
  addByName: (name: string) => boolean;
  dropIngredient: (id: string) => void;
  setUrgency: (id: string, urgency: Urgency) => void;
  cycleUrgency: (id: string) => void;
  toggleEquipment: (kind: string) => void;
  answer: <K extends keyof IntakeAnswers>(
    key: K,
    value: IntakeAnswers[K] extends Answer<infer V> ? V : never,
  ) => void;
  startDemo: () => void;
  compile: () => void;
  /** Change one answer and recompile on the spot, with no curtain. */
  adjust: <K extends keyof IntakeAnswers>(
    key: K,
    value: IntakeAnswers[K] extends Answer<infer V> ? V : never,
  ) => void;
  settle: () => void;
  reset: () => void;
  canCompile: () => boolean;
};

export const useSession = create<SessionState>((set, get) => ({
  screen: 'landing',
  intake: emptyIntake(),
  outcome: null,
  compiling: false,

  goTo: (screen) => set({ screen }),

  setPantry: (pantry) => set((s) => ({ intake: { ...s.intake, pantry } })),

  addIngredient: (ingredient) =>
    set((s) =>
      s.intake.pantry.some((i) => i.canonicalName === ingredient.canonicalName)
        ? s
        : { intake: { ...s.intake, pantry: [...s.intake.pantry, ingredient] } },
    ),

  /**
   * One name in, one ingredient out.
   *
   * The lexicon normalises it and says how fast it goes off, which becomes the urgency it
   * arrives with — the user's most valuable input and the one nobody wants to supply
   * seventeen times. What the lexicon does not recognise is kept exactly as typed and
   * flagged, because replacing "yu choy" with "bok choy" builds a plan on food that is not
   * in the fridge.
   */
  addByName: (name) => {
    const raw = name.trim();
    if (raw.length === 0) return false;
    const resolved = resolveIngredient(raw);
    if (get().intake.pantry.some((i) => i.canonicalName === resolved.canonicalName)) return false;

    const ingredient = IngredientSchema.parse({
      id: ingredientId(resolved.canonicalName),
      name: resolved.unrecognised ? raw : resolved.canonicalName,
      canonicalName: resolved.canonicalName,
      urgency: defaultUrgency(resolved.keepsDays),
      category: resolved.category,
      allergens: resolved.allergens,
      unrecognised: resolved.unrecognised,
      ...(resolved.typicalUnit ? { unit: resolved.typicalUnit } : {}),
    });
    set((s) => ({ intake: { ...s.intake, pantry: [...s.intake.pantry, ingredient] } }));
    return true;
  },

  dropIngredient: (id) =>
    set((s) => ({ intake: { ...s.intake, pantry: s.intake.pantry.filter((i) => i.id !== id) } })),

  setUrgency: (id, urgency) =>
    set((s) => ({
      intake: {
        ...s.intake,
        pantry: s.intake.pantry.map((i) => (i.id === id ? { ...i, urgency } : i)),
      },
    })),

  /** today -> this week -> keeps -> today. Three states is a cycle, not a menu. */
  cycleUrgency: (id) =>
    set((s) => ({
      intake: {
        ...s.intake,
        pantry: s.intake.pantry.map((i) =>
          i.id === id ? { ...i, urgency: URGENCY_CYCLE[i.urgency] } : i,
        ),
      },
    })),

  toggleEquipment: (kind) =>
    set((s) => {
      const have = s.intake.equipment.value;
      const offered = OFFERED_EQUIPMENT.find((e) => e.kind === kind);
      const next = have.some((e) => e.kind === kind)
        ? have.filter((e) => e.kind !== kind)
        : [...have, { kind, count: offered?.count ?? 1 }];
      return { intake: { ...s.intake, equipment: { value: next, source: 'stated' } } };
    }),

  answer: (key, value) =>
    set((s) => ({ intake: { ...s.intake, [key]: { value, source: 'stated' as const } } })),

  startDemo: () => {
    set({ intake: demoIntake() });
    get().compile();
  },

  /**
   * Compile synchronously and show the result behind the curtain.
   *
   * The work takes single-digit milliseconds, so there is nothing to await and no spinner
   * that would mean anything. The curtain is up for as long as it takes to read four
   * stages, and `settle` takes it down — the schedule is already there underneath it.
   */
  compile: () => {
    const outcome = compileSession(get().intake);
    set({ outcome, compiling: true, screen: outcome.ok ? 'timeline' : 'intake' });
  },

  /**
   * Recompiling is the product, not a refresh.
   *
   * Moving the time budget from an hour to half an hour is the single most convincing thing
   * this app does: the plan is rebuilt, the schedule re-solved, and if it no longer fits the
   * degradation ladder says out loud what it cut. It takes a few milliseconds, so it happens
   * as you change the control rather than behind a button that says "recompile".
   */
  adjust: (key, value) => {
    const intake = { ...get().intake, [key]: { value, source: 'stated' as const } };
    set({ intake, outcome: compileSession(intake) });
  },

  settle: () => set({ compiling: false }),

  reset: () => set({ screen: 'landing', intake: emptyIntake(), outcome: null, compiling: false }),

  /** Compiling needs food. Everything else has a defensible default. */
  canCompile: () => get().intake.pantry.length > 0,
}));
