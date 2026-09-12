/**
 * The scheduling engine.
 *
 * Compiled into both the API and the browser bundle, which is the whole reason it is a
 * package: the server is authoritative, the client computes optimistically, and the two
 * must agree byte for byte.
 *
 * Pure, deterministic, zero I/O, no ambient clock, no ambient randomness, no Node
 * built-ins -- all lint-enforced.
 */
export const SCHEDULER_VERSION = '0.3.0';

export { compileTaskGraph } from './graph/compile';
export type { TaskGraph, CompileResult } from './graph/compile';

export { compileSchedule } from './engine/compile';
export type { CompileOptions, EngineResult, CompileSuccess, CompileFailure } from './engine/compile';

export { computeCpm, topologicalOrder, serialMinutes } from './engine/cpm';
export type { CpmResult, CpmNode } from './engine/cpm';

export { needsWash, needOf, leavesOf, washMinutes } from './engine/contamination';
export { scheduleTasks } from './engine/schedule';
export type { ScheduleAttempt } from './engine/schedule';
