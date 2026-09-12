import { z } from 'zod';

/**
 * Server configuration.
 *
 * Parsed and validated once, before anything opens a listener. A configuration mistake
 * should fail the deploy, not the first request that happens to read the bad value — by
 * which point traffic has already shifted and the cause is buried under whatever that
 * request was doing.
 */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Allowed browser origins. Empty in development means "reflect the request origin". */
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
  /** Cloud Run sets this. Its presence is how we know we are not on a laptop. */
  K_SERVICE: z.string().optional(),
  GOOGLE_CLOUD_PROJECT: z.string().optional(),
  VERTEX_LOCATION: z.string().default('global'),
  /** Serves recorded fixtures instead of calling a provider. For the demo and for tests. */
  DEMO_MODE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof EnvSchema>;

export class ConfigError extends Error {
  constructor(readonly issues: { path: string; message: string }[]) {
    super(
      [
        `Configuration is invalid: ${issues.length} problem${issues.length === 1 ? '' : 's'}.`,
        '',
        ...issues.map((i) => `  ${i.path}: ${i.message}`),
        '',
        'See .env.example for every name and its expected shape.',
      ].join('\n'),
    );
    this.name = 'ConfigError';
  }
}

export const parseEnv = (raw: Record<string, string | undefined>): Env => {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message })),
    );
  }
  return result.data;
};

/** What the startup log prints. Deliberately carries no secret-bearing value. */
export const describeEnv = (env: Env): Record<string, unknown> => ({
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
  host: env.HOST,
  logLevel: env.LOG_LEVEL,
  corsOrigins: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : '(reflect request origin)',
  runtime: env.K_SERVICE ? `cloud-run:${env.K_SERVICE}` : 'local',
  vertexLocation: env.VERTEX_LOCATION,
  demoMode: env.DEMO_MODE,
});
