/**
 * Fixture factories. Every factory returns a value that parses cleanly against its own
 * schema, and accepts a partial override so a test can state only the thing it is about.
 */
import {
  ALL_TASK_CLASSES,
  HELPER_TASK_CLASSES,
  type Constraints,
  type Cook,
  type Dish,
  type Equipment,
  type Ingredient,
  type Task,
  ConstraintsSchema,
  CookSchema,
  DishSchema,
  EquipmentSchema,
  IngredientSchema,
  TaskSchema,
  equipmentId,
  ingredientId,
  makeId,
} from './index';

type Partialish<T> = Partial<T>;

export const anIngredient = (over: Partialish<Ingredient> = {}): Ingredient =>
  IngredientSchema.parse({
    id: ingredientId(over.canonicalName ?? 'chicken breast'),
    name: 'chicken breast',
    canonicalName: 'chicken breast',
    quantity: 500,
    unit: 'g',
    urgency: 'use-soon',
    prepState: 'unwashed',
    category: 'protein-raw',
    allergens: [],
    ...over,
  });

export const aCook = (over: Partialish<Cook> = {}): Cook =>
  CookSchema.parse({
    id: makeId('cook', over.name ?? 'cook-1'),
    name: 'Cook 1',
    skill: 'intermediate',
    eligibleFor: ALL_TASK_CLASSES,
    available: [{ startMin: 0, endMin: 240 }],
    colorToken: 'cook-1',
    ...over,
  });

export const aHelper = (over: Partialish<Cook> = {}): Cook =>
  aCook({
    id: makeId('cook', 'helper'),
    name: 'Helper',
    skill: 'beginner',
    eligibleFor: [...HELPER_TASK_CLASSES],
    colorToken: 'cook-2',
    ...over,
  });

export const someEquipment = (over: Partialish<Equipment> = {}): Equipment =>
  EquipmentSchema.parse({
    id: equipmentId(over.kind ?? 'frying-pan'),
    kind: 'frying-pan',
    count: 1,
    contaminationState: 'clean',
    ...over,
  });

export const aTask = (over: Partialish<Task> = {}): Task =>
  TaskSchema.parse({
    id: makeId('task', 'demo', over.name ?? 'chop', over.phase ?? 'start'),
    dishId: 'dish:demo',
    name: 'Chop the bok choy',
    class: 'knife-work',
    phase: 'start',
    durationMin: 4,
    requiresCook: over.phase === 'hold' ? false : true,
    equipment: [{ kind: 'cutting-board', count: 1, heldThroughHold: false }],
    ingredients: ['bok choy'],
    deps: [],
    safety: [],
    effort: 2,
    minSkill: 'beginner',
    ...over,
  });

export const aDish = (over: Partialish<Dish> = {}): Dish =>
  DishSchema.parse({
    id: 'dish:demo',
    name: 'Demo stir-fry',
    kind: 'main',
    servings: 4,
    tasks: [aTask()],
    ingredients: [],
    allergens: [],
    ...over,
  });

/** The §10 demo kitchen: 60 minutes, 4 portions, two cooks, two burners, no oven. */
export const demoConstraints = (over: Partialish<Constraints> = {}): Constraints =>
  ConstraintsSchema.parse({
    timeBudgetMin: 60,
    servings: 4,
    cooks: [aCook(), aHelper({ name: 'Cook 2' })],
    equipment: [
      someEquipment({ kind: 'burner', count: 2 }),
      someEquipment({ kind: 'frying-pan', count: 1 }),
      someEquipment({ kind: 'saucepan', count: 1 }),
      // §10 names the burners and the two pans. A real kitchen with those also has a pot,
      // a grater and a blender, and the demo recipes need all three -- without them the
      // scheduler correctly reports tasks it cannot place, which is a fixture bug, not an
      // engine bug.
      someEquipment({ kind: 'pot', count: 1 }),
      someEquipment({ kind: 'grater', count: 1 }),
      someEquipment({ kind: 'blender', count: 1 }),
      someEquipment({ kind: 'cutting-board', count: 2 }),
      someEquipment({ kind: 'knife', count: 2 }),
      someEquipment({ kind: 'mixing-bowl', count: 3 }),
      someEquipment({ kind: 'jar', count: 2 }),
      someEquipment({ kind: 'pitcher', count: 1 }),
      someEquipment({ kind: 'storage-container', count: 8 }),
      someEquipment({ kind: 'fridge-shelf', count: 1, capacity: 4 }),
      someEquipment({ kind: 'sink', count: 1 }),
      someEquipment({ kind: 'colander', count: 1 }),
      someEquipment({ kind: 'measuring-cup', count: 1 }),
    ],
    restrictions: [],
    style: ['asian'],
    optimization: 'balanced',
    fridgeCapacity: 4,
    ...over,
  });
