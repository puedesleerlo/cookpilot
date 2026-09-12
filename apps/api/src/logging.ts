import pino, { type Logger, type LoggerOptions } from 'pino';
import { redact, redactDeep } from './config/redact';
import type { Env } from './config/env';

/**
 * Logging.
 *
 * Redaction is wired in at the serialiser rather than left to call sites. "Remember not to
 * log the secret" is not a rule anyone keeps under pressure, and the leak always happens in
 * the debug line someone added at 1am to find out why a provider call was failing — which
 * is, definitionally, a line about the credentials.
 *
 * pino's own `redact` option only knows about paths you name in advance. That covers the
 * headers we expect; `redactDeep` covers the ones we did not.
 */


/**
 * `formatters.log` only receives the merge object, so a secret written into the *message
 * string* — `logger.error(`failed using ${key}`)` — would sail straight through it. That
 * is the likeliest shape for an accidental leak, because it is what a hurried debug line
 * looks like. This hook redacts the string arguments before pino ever sees them.
 */
const logMethod = function (this: unknown, args: unknown[], method: (...a: unknown[]) => void) {
  method.apply(
    this,
    args.map((a) => (typeof a === 'string' ? redact(a) : a)),
  );
};

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  '*.apiKey',
  '*.api_key',
  '*.password',
  '*.token',
  '*.secret',
];

export const createLogger = (env: Env): Logger => {
  const options: LoggerOptions = {
    level: env.LOG_LEVEL,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    /**
     * The second pass. Everything logged goes through shape-and-value redaction, so a
     * credential reaches the output neither through a path we forgot to list nor inside a
     * free-text message.
     */
    formatters: {
      level: (label) => ({ level: label }),
      log: (object) => redactDeep(object) as Record<string, unknown>,
    },
    hooks: { logMethod },
    base: { service: 'api' },
    // Cloud Logging reads this field as the severity timestamp.
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  // Pretty output locally; structured JSON in Cloud Run, where something else parses it.
  if (!env.K_SERVICE && env.NODE_ENV === 'development') {
    return pino({
      ...options,
      transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
    });
  }
  return pino(options);
};

/**
 * A test logger that captures lines instead of writing them, so redaction can be asserted
 * rather than eyeballed.
 */
export const createCapturingLogger = (): { logger: Logger; lines: () => unknown[] } => {
  const captured: unknown[] = [];
  const logger = pino(
    {
      level: 'trace',
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
      formatters: { log: (object) => redactDeep(object) as Record<string, unknown> },
      hooks: { logMethod },
    },
    {
      write: (line: string) => {
        captured.push(JSON.parse(line));
      },
    },
  );
  return { logger, lines: () => captured };
};
