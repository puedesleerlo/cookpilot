/**
 * Deterministic identity.
 *
 * The scheduler breaks ties on task id. If ids came from a counter, a UUID or a clock,
 * the "same input yields byte-identical output" guarantee would quietly depend on
 * allocation order. So ids are built from meaningful, stable components instead.
 */

/** Lowercase, hyphen-separated, safe inside a URL fragment. */
export const slug = (raw: string): string =>
  raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-') || 'x';

/** `makeId('task', 'Bok Choy & Garlic', 'start')` -> `task:bok-choy-garlic:start`. */
export const makeId = (...parts: (string | number)[]): string =>
  parts.map((p) => slug(String(p))).join(':');

export const ingredientId = (canonicalName: string): string => makeId('ing', canonicalName);
export const dishId = (packId: string, recipeId: string): string => makeId('dish', packId, recipeId);
export const stepId = (recipeId: string, index: number): string => makeId('step', recipeId, index);
export const taskId = (dish: string, step: string, phase: string): string =>
  makeId('task', dish, step, phase);
export const cookId = (name: string): string => makeId('cook', name);
export const equipmentId = (kind: string): string => makeId('eq', kind);

/**
 * A stable 32-bit hash for content addressing (pack `contentHash`, schedule identity).
 * FNV-1a: small, dependency-free, and identical across runs — which `crypto.randomUUID`
 * is not, and which is the entire point.
 */
export const stableHash = (input: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};

/** Content hash over any JSON-serialisable value, with object keys sorted for stability. */
export const contentHash = (value: unknown): string => `fnv1a-${stableHash(canonicalJson(value))}`;

export const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
};
