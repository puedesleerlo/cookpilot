import {
  ALL_TASK_CLASSES,
  ConstraintsSchema,
  CookSchema,
  EquipmentSchema,
  HELPER_TASK_CLASSES,
  equipmentId,
  makeId,
  type Constraints,
  type Cook,
  type Equipment,
} from '@kitchen/domain';
import type { EquipmentAnswer, IntakeAnswers } from './store';

/**
 * Intake answers become constraints.
 *
 * The one interesting decision here is the crew. The intake asks how many people are
 * cooking, not what each of them can do, because nobody wants to fill in a skills matrix
 * before dinner. So the first cook is assumed to be the one who knows the kitchen and
 * everyone else is assumed to be helping: confident hands and eligible for everything,
 * then beginners eligible for the classes that cannot burn or poison anyone.
 *
 * That assumption is deliberately pessimistic. Handing a helper something they cannot do
 * produces a session that falls apart in the kitchen; assuming they can only wash and chop
 * produces one that finishes slightly later than it had to. The crew screen is where
 * someone corrects it, and correcting it upward is the pleasant direction.
 */

const SESSION_WINDOW = [{ startMin: 0, endMin: 240 }];

const cookNames = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => (i === 0 ? 'Cook 1' : `Cook ${i + 1}`));

export const crewFrom = (cookCount: number): Cook[] =>
  cookNames(Math.max(1, cookCount)).map((name, i) =>
    CookSchema.parse({
      id: makeId('cook', i === 0 ? 'cook-1' : `helper-${i}`),
      name,
      skill: i === 0 ? 'intermediate' : 'beginner',
      eligibleFor: i === 0 ? ALL_TASK_CLASSES : [...HELPER_TASK_CLASSES],
      available: SESSION_WINDOW,
      colorToken: `cook-${i % 4}`,
    }),
  );

/** A fridge shelf holds four containers; everything else is counted, not measured. */
const CAPACITY: Partial<Record<string, number>> = { 'fridge-shelf': 4, 'freezer-shelf': 4 };

export const equipmentFrom = (answers: EquipmentAnswer[]): Equipment[] =>
  answers
    .filter((e) => e.count > 0)
    .map((e) =>
      EquipmentSchema.parse({
        id: equipmentId(e.kind),
        kind: e.kind,
        count: e.count,
        ...(CAPACITY[e.kind] ? { capacity: CAPACITY[e.kind] } : {}),
        contaminationState: 'clean',
      }),
    );

export const constraintsFrom = (intake: IntakeAnswers): Constraints =>
  ConstraintsSchema.parse({
    timeBudgetMin: intake.timeBudgetMin.value,
    servings: intake.servings.value,
    cooks: crewFrom(intake.cookCount.value),
    equipment: equipmentFrom(intake.equipment.value),
    restrictions: intake.restrictions.value,
    // "No drinks" is a style the plan builder already understands, so a preference the user
    // states once does not need a second code path to honour it.
    style: [intake.style.value, ...(intake.wantsBeverages.value ? [] : ['no-drinks'])],
    optimization: 'balanced',
    fridgeCapacity: 4,
  });
