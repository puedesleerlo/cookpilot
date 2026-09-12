import { redact } from './config';

/**
 * An in-application record of every stage run. You will need it: when a schedule looks
 * wrong, the first question is always whether the model or the fallback produced the
 * input, and this is the only place that answer lives.
 */
export type StageRun = {
  id: number;
  stage: string;
  startedAt: number;
  durationMs: number;
  source: 'model' | 'repaired' | 'fallback';
  repairs: number;
  ok: boolean;
  prompt: string;
  response: string;
  issues: string[];
  note?: string;
};

const CAPACITY = 60;
let entries: StageRun[] = [];
let nextId = 1;
const listeners = new Set<(runs: StageRun[]) => void>();

export const recordStageRun = (run: Omit<StageRun, 'id'>): StageRun => {
  const entry: StageRun = {
    ...run,
    id: nextId++,
    prompt: redact(run.prompt),
    response: redact(run.response),
    note: run.note ? redact(run.note) : undefined,
  };
  entries = [entry, ...entries].slice(0, CAPACITY);
  for (const l of listeners) l(entries);
  return entry;
};

export const stageRuns = (): readonly StageRun[] => entries;
export const clearStageRuns = (): void => {
  entries = [];
  for (const l of listeners) l(entries);
};
export const subscribeStageRuns = (fn: (runs: StageRun[]) => void): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
