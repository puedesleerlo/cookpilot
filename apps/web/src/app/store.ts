import { create } from 'zustand';
import type { Allergen, Ingredient, Urgency } from '@kitchen/domain';
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

/** The standard small kitchen, used until someone says otherwise. */
export const DEFAULT_EQUIPMENT: EquipmentAnswer[] = [
  { kind: 'burner', count: 2 },
  { kind: 'frying-pan', count: 1 },
  { kind: 'saucepan', count: 1 },
  { kind: 'cutting-board', count: 2 },
  { kind: 'knife', count: 2 },
  { kind: 'mixing-bowl', count: 3 },
  { kind: 'storage-container', count: 8 },
  { kind: 'fridge-shelf', count: 1 },
  { kind: 'sink', count: 1 },
];

const assumed = <T>(value: T): Answer<T> => ({ value, source: 'assumed' });

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

  goTo: (screen: Screen) => void;
  setPantry: (pantry: Ingredient[]) => void;
  addIngredient: (ingredient: Ingredient) => void;
  dropIngredient: (id: string) => void;
  setUrgency: (id: string, urgency: Urgency) => void;
  answer: <K extends keyof IntakeAnswers>(
    key: K,
    value: IntakeAnswers[K] extends Answer<infer V> ? V : never,
  ) => void;
  startDemo: () => void;
  reset: () => void;
  canCompile: () => boolean;
};

export const useSession = create<SessionState>((set, get) => ({
  screen: 'landing',
  intake: emptyIntake(),

  goTo: (screen) => set({ screen }),

  setPantry: (pantry) => set((s) => ({ intake: { ...s.intake, pantry } })),

  addIngredient: (ingredient) =>
    set((s) =>
      s.intake.pantry.some((i) => i.canonicalName === ingredient.canonicalName)
        ? s
        : { intake: { ...s.intake, pantry: [...s.intake.pantry, ingredient] } },
    ),

  dropIngredient: (id) =>
    set((s) => ({ intake: { ...s.intake, pantry: s.intake.pantry.filter((i) => i.id !== id) } })),

  setUrgency: (id, urgency) =>
    set((s) => ({
      intake: {
        ...s.intake,
        pantry: s.intake.pantry.map((i) => (i.id === id ? { ...i, urgency } : i)),
      },
    })),

  answer: (key, value) =>
    set((s) => ({ intake: { ...s.intake, [key]: { value, source: 'stated' as const } } })),

  startDemo: () => set({ intake: demoIntake(), screen: 'crew' }),

  reset: () => set({ screen: 'landing', intake: emptyIntake() }),

  /** Compiling needs food. Everything else has a defensible default. */
  canCompile: () => get().intake.pantry.length > 0,
}));
