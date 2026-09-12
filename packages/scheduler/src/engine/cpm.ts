import type { Task } from '@kitchen/domain';

/**
 * Critical path.
 *
 * A forward pass gives the earliest each task could possibly start; a backward pass gives
 * the latest it could start without pushing the finish. The gap is slack, and slack is what
 * the resource scheduler prioritises on — a task with no slack is one where every minute of
 * delay costs a minute at the end, so it goes first when two tasks want the same pan.
 *
 * This is computed ignoring resources. That is deliberate: it is a lower bound and a
 * priority signal, not a schedule. The real ordering happens against real burners.
 */

export type CpmNode = {
  taskId: string;
  earliestStart: number;
  earliestFinish: number;
  latestStart: number;
  latestFinish: number;
  slackMin: number;
  /** Longest path from here to the end, in minutes. Used to break priority ties. */
  remainingPathMin: number;
};

export type CpmResult = {
  nodes: Map<string, CpmNode>;
  /** Lower bound on the finish time: what perfect, unlimited resources would achieve. */
  lowerBoundMin: number;
  criticalPath: string[];
};

/**
 * Topological order, deterministic. Ties break on task id so two runs cannot disagree about
 * the order two independent tasks are visited in.
 */
export const topologicalOrder = (tasks: Task[]): string[] => {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const task of tasks) {
    indegree.set(task.id, 0);
    dependents.set(task.id, []);
  }
  for (const task of tasks) {
    for (const dep of task.deps) {
      if (!byId.has(dep.fromTaskId)) continue;
      indegree.set(task.id, (indegree.get(task.id) ?? 0) + 1);
      dependents.get(dep.fromTaskId)!.push(task.id);
    }
  }

  const ready = [...indegree.entries()]
    .filter(([, n]) => n === 0)
    .map(([id]) => id)
    .sort();
  const order: string[] = [];

  while (ready.length > 0) {
    const id = ready.shift()!;
    order.push(id);
    for (const next of dependents.get(id)!.sort()) {
      const remaining = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, remaining);
      if (remaining === 0) {
        // Insert in sorted position rather than push-then-sort: same result, and it keeps
        // the order a function of the ids alone.
        const at = ready.findIndex((x) => x > next);
        if (at === -1) ready.push(next);
        else ready.splice(at, 0, next);
      }
    }
  }

  return order;
};

export const computeCpm = (tasks: Task[]): CpmResult => {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const order = topologicalOrder(tasks);
  const nodes = new Map<string, CpmNode>();

  // ---- forward: earliest possible, respecting dependencies and minimum delays
  for (const id of order) {
    const task = byId.get(id)!;
    let earliestStart = 0;
    for (const dep of task.deps) {
      const from = nodes.get(dep.fromTaskId);
      if (!from) continue;
      const ready =
        dep.type === 'start-to-start'
          ? from.earliestStart + (dep.minDelayMin ?? 0)
          : from.earliestFinish + (dep.minDelayMin ?? 0);
      earliestStart = Math.max(earliestStart, ready);
    }
    nodes.set(id, {
      taskId: id,
      earliestStart,
      earliestFinish: earliestStart + task.durationMin,
      latestStart: 0,
      latestFinish: 0,
      slackMin: 0,
      remainingPathMin: 0,
    });
  }

  const lowerBoundMin = Math.max(0, ...[...nodes.values()].map((n) => n.earliestFinish));

  // ---- backward: latest without pushing the finish
  const dependents = new Map<string, { id: string; minDelay: number }[]>();
  for (const task of tasks) {
    for (const dep of task.deps) {
      if (!byId.has(dep.fromTaskId)) continue;
      const list = dependents.get(dep.fromTaskId) ?? [];
      list.push({ id: task.id, minDelay: dep.minDelayMin ?? 0 });
      dependents.set(dep.fromTaskId, list);
    }
  }

  for (const id of [...order].reverse()) {
    const task = byId.get(id)!;
    const node = nodes.get(id)!;
    const after = dependents.get(id) ?? [];

    let latestFinish = lowerBoundMin;
    let remainingPathMin = 0;
    for (const { id: nextId, minDelay } of after) {
      const next = nodes.get(nextId)!;
      latestFinish = Math.min(latestFinish, next.latestStart - minDelay);
      remainingPathMin = Math.max(remainingPathMin, minDelay + next.remainingPathMin);
    }

    node.latestFinish = latestFinish;
    node.latestStart = latestFinish - task.durationMin;
    node.slackMin = node.latestStart - node.earliestStart;
    node.remainingPathMin = task.durationMin + remainingPathMin;
  }

  // Zero slack means every minute of delay here costs a minute at the end.
  const criticalPath = order.filter((id) => nodes.get(id)!.slackMin === 0);

  return { nodes, lowerBoundMin, criticalPath };
};

/** Total work if one cook did one thing at a time. The baseline parallelism is measured against. */
export const serialMinutes = (tasks: Task[]): number =>
  tasks.reduce((n, t) => n + t.durationMin, 0);
