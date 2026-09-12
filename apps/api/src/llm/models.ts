/**
 * Every model string in the system, in one place.
 *
 * This module exists because model deprecation is a scheduling problem, not a style one.
 * Gemini 2.5 shuts down in October 2026; a 2.5 string anywhere in this codebase would be a
 * scheduled outage, and finding it would mean grepping a codebase rather than reading a
 * config. A test asserts none exists.
 *
 * Each stage is independently overridable by environment variable, so replacing a model is
 * a deploy, not a pull request.
 */

export const STAGES = [
  'L1-intake',
  'L2-query-brief',
  'L3-normalize',
  'L3-normalize-hard',
  'L4-enrich',
  'L5-explain',
] as const;

export type Stage = (typeof STAGES)[number];

/** Model identifiers currently served. Nothing from the 2.5 generation. */
export const MODELS = {
  flashLite: 'gemini-3.5-flash-lite',
  flash: 'gemini-3.8-flash',
  pro: 'gemini-3.1-pro',
} as const;

export type StageConfig = {
  model: string;
  /** Why this model and not a cheaper or dearer one. */
  rationale: string;
  /** 3.6+ Flash models are served from the global region only. */
  location: 'global' | 'us-central1';
  maxOutputTokens: number;
  temperature: number;
  /** Off by default; L3's hard path is opened deliberately, per page. */
  enabledByDefault: boolean;
};

const ENV_KEY: Record<Stage, string> = {
  'L1-intake': 'MODEL_L1_INTAKE',
  'L2-query-brief': 'MODEL_L2_QUERY_BRIEF',
  'L3-normalize': 'MODEL_L3_NORMALIZE',
  'L3-normalize-hard': 'MODEL_L3_NORMALIZE_HARD',
  'L4-enrich': 'MODEL_L4_ENRICH',
  'L5-explain': 'MODEL_L5_EXPLAIN',
};

const DEFAULTS: Record<Stage, StageConfig> = {
  'L1-intake': {
    model: MODELS.flashLite,
    rationale: 'Latency-critical behind voice, and high volume. This is what Flash-Lite is for.',
    location: 'global',
    maxOutputTokens: 2048,
    // Slot filling wants consistency, not invention.
    temperature: 0.2,
    enabledByDefault: true,
  },
  'L2-query-brief': {
    model: MODELS.flashLite,
    rationale: 'Writing a search query is trivial and frequent. Ranking itself is deterministic.',
    location: 'global',
    maxOutputTokens: 512,
    temperature: 0.3,
    enabledByDefault: true,
  },
  'L3-normalize': {
    model: MODELS.flash,
    rationale: 'Messy HTML, long context, and real reasoning about what a step occupies.',
    location: 'global',
    maxOutputTokens: 8192,
    temperature: 0.1,
    enabledByDefault: true,
  },
  'L3-normalize-hard': {
    model: MODELS.pro,
    rationale: 'For pages Flash fails on. Opened deliberately, per page, never by default.',
    location: 'global',
    maxOutputTokens: 8192,
    temperature: 0.1,
    enabledByDefault: false,
  },
  'L4-enrich': {
    model: MODELS.flashLite,
    rationale: 'Bounded by the plausible-range validator downstream, so judgement matters less here.',
    location: 'global',
    maxOutputTokens: 4096,
    temperature: 0.2,
    enabledByDefault: true,
  },
  'L5-explain': {
    model: MODELS.flashLite,
    rationale: 'Optional polish over rationale the engine already produced.',
    location: 'global',
    maxOutputTokens: 1024,
    temperature: 0.5,
    enabledByDefault: true,
  },
};

export const stageConfig = (stage: Stage, env: Record<string, string | undefined> = {}): StageConfig => {
  const base = DEFAULTS[stage];
  const override = env[ENV_KEY[stage]];
  return override && override.trim().length > 0 ? { ...base, model: override.trim() } : base;
};

export const envKeyFor = (stage: Stage): string => ENV_KEY[stage];
export const isStage = (value: unknown): value is Stage =>
  typeof value === 'string' && (STAGES as readonly string[]).includes(value);

/**
 * Per-million-token prices, September 2026. Used for the internal spend metric only — this
 * moved three times in 2026, so treat the numbers as indicative and re-check before
 * modelling cost seriously.
 */
export const PRICING: Record<string, { inputPerMTok: number; outputPerMTok: number }> = {
  [MODELS.flashLite]: { inputPerMTok: 0.3, outputPerMTok: 2.5 },
  // Introductory pricing through 2026-12-31; rises afterwards.
  [MODELS.flash]: { inputPerMTok: 0.75, outputPerMTok: 3.0 },
  [MODELS.pro]: { inputPerMTok: 2.0, outputPerMTok: 12.0 },
};

export const estimateCost = (model: string, tokensIn: number, tokensOut: number): number => {
  const price = PRICING[model];
  if (!price) return 0;
  return (tokensIn / 1_000_000) * price.inputPerMTok + (tokensOut / 1_000_000) * price.outputPerMTok;
};
