/**
 * Model configuration, in one place so a stage never picks its own.
 *
 * Note on the key: `VITE_ANTHROPIC_API_KEY` is inlined into the client bundle at build
 * time. That is fine for a local demo and wrong for a deployment. The debug panel says so
 * rather than letting the app imply the key is safe here.
 */
export const MODEL_ID = 'claude-opus-5';

/** Per-stage reasoning effort. Extraction is cheap; structure genuinely reasons. */
export const STAGE_EFFORT = {
  'L1-intake': 'low',
  'L2-candidates': 'low',
  'L3-normalize': 'medium',
  'L4-enrich': 'medium',
  'L5-explain': 'low',
} as const satisfies Record<string, 'low' | 'medium' | 'high'>;

export type StageName = keyof typeof STAGE_EFFORT;

export const REQUEST_TIMEOUT_MS = 30_000;
export const MAX_TOKENS = 8_000;

type Env = Record<string, string | undefined>;

const readEnv = (): Env => {
  try {
    return (import.meta.env ?? {}) as Env;
  } catch {
    return {};
  }
};

export const getApiKey = (env: Env = readEnv()): string | null => {
  const key = env['VITE_ANTHROPIC_API_KEY'];
  return key && key.trim().length > 0 ? key.trim() : null;
};

export const hasModelAccess = (env?: Env): boolean => getApiKey(env) !== null;

/** Redact anything that looks like a key before it reaches a log or a screen. */
export const redact = (text: string): string =>
  text.replace(/sk-ant-[A-Za-z0-9_-]{8,}/g, 'sk-ant-***');
