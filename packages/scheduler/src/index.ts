/**
 * The scheduling engine.
 *
 * Compiled into both the API and the browser bundle, which is the whole reason it is a
 * package: the server is authoritative, the client computes optimistically, and the two
 * must agree byte for byte. A second implementation would drift, and the drift would show
 * up as the timeline changing when you reconnect.
 *
 * Pure, deterministic, zero I/O, no ambient clock, no ambient randomness, no Node
 * built-ins -- all lint-enforced. The engine lands in `add-scheduling-engine`.
 */
export const SCHEDULER_VERSION = '0.1.0';
