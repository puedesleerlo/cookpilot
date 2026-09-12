import {
  HEAT_SANITISING_EQUIPMENT,
  RAW_PROTEIN_STATES,
  type ContaminationState,
  type EquipmentKind,
  type Task,
} from '@kitchen/domain';

/**
 * The contamination model.
 *
 * One rule does the work, and it is the only rule in this engine the degradation ladder is
 * not allowed to trade away: **a surface carrying raw protein must be washed before it
 * touches food that will not be cooked afterwards.**
 *
 * The interesting distinction is between a board and a pan. Both get contaminated; only one
 * gets hot enough to deal with it. A pan that seared chicken and then sears beef is fine —
 * the next use applies heat to the same surface. A board that held raw chicken and is then
 * used for salad is not fine, and no amount of heat elsewhere in the recipe changes that.
 */

export type SurfaceNeed = 'ready-to-eat' | 'will-be-heated' | 'raw-protein' | 'indifferent';

/** What a task needs from the surface it is handed. */
export const needOf = (task: Task): SurfaceNeed => {
  if (task.safety.some((s) => s.kind === 'ready-to-eat')) return 'ready-to-eat';
  if (task.safety.some((s) => s.kind === 'raw-protein')) return 'raw-protein';
  if (
    task.class === 'stovetop' ||
    task.class === 'oven' ||
    task.class === 'boil-water' ||
    task.class === 'simmer-watch'
  ) {
    return 'will-be-heated';
  }
  // Washing, mixing and portioning of raw components: not ready-to-eat, but not heated either.
  if (task.class === 'wash-produce' || task.class === 'garnish' || task.class === 'assemble') {
    return 'ready-to-eat';
  }
  return 'indifferent';
};

/** What a task leaves behind on the equipment it used. */
export const leavesOf = (task: Task): ContaminationState => {
  const raw = task.safety.find((s) => s.kind === 'raw-protein');
  if (raw && raw.kind === 'raw-protein') return raw.leaves;
  if (task.class === 'wash-up') return 'clean';
  if (task.durationMin > 0 && task.phase !== 'hold') return 'soiled';
  return 'clean';
};

/**
 * Does moving from `from` to a task with need `need`, on this kind of equipment, require a
 * wash in between?
 *
 * The table, stated plainly:
 *
 *   raw protein  ->  ready-to-eat            : ALWAYS wash, on any surface
 *   raw protein  ->  heated, on cookware     : no wash; the heat handles it
 *   raw protein  ->  heated, on a board      : wash; a board is not heated
 *   raw protein  ->  more raw protein        : no wash; it is already contaminated
 *   soiled       ->  ready-to-eat            : wash; last night's oil is not seasoning
 *   soiled       ->  anything else           : no wash
 *   clean        ->  anything                : no wash
 */
export const needsWash = (
  from: ContaminationState,
  need: SurfaceNeed,
  kind: EquipmentKind,
): boolean => {
  if (from === 'clean') return false;

  if (RAW_PROTEIN_STATES.has(from)) {
    if (need === 'ready-to-eat') return true;
    if (need === 'raw-protein') return false;
    if (need === 'will-be-heated') return !HEAT_SANITISING_EQUIPMENT.has(kind);
    // Indifferent work on a contaminated surface — mixing, measuring — still gets a wash,
    // because we cannot tell what the result goes on to become.
    return true;
  }

  if (from === 'soiled') return need === 'ready-to-eat';

  // allergen:<id> — washed before anything the session is avoiding.
  return need === 'ready-to-eat';
};

/** How long a wash takes, by what is being washed. */
export const washMinutes = (kind: EquipmentKind, from: ContaminationState): number => {
  const base = RAW_PROTEIN_STATES.has(from) ? 3 : 2;
  if (kind === 'pot' || kind === 'wok' || kind === 'sheet-pan') return base + 1;
  if (kind === 'knife' || kind === 'grater') return base - 1;
  return base;
};

export const describeWash = (kind: EquipmentKind, from: ContaminationState): string => {
  if (RAW_PROTEIN_STATES.has(from)) {
    const what = from === 'raw-fish' ? 'raw fish' : from === 'raw-egg' ? 'raw egg' : 'raw meat';
    return `Wash the ${kind.replace('-', ' ')} — it had ${what} on it and what comes next is not cooked again.`;
  }
  return `Rinse the ${kind.replace('-', ' ')} before the next thing goes on it.`;
};
