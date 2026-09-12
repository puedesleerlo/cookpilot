import process from 'node:process';
import { buildServer } from './server';
import { ConfigError, parseEnv } from './config/env';
import { envResolver, requireSecrets } from './config/loader';

/**
 * Entry point.
 *
 * Configuration and secrets are both validated before a listener opens. A deploy that is
 * missing something fails as a deploy, visibly, rather than passing a health check and
 * then failing the first request that needed it.
 */
const die = (message: string): never => {
  process.stderr.write(`\n${message}\n\n`);
  process.exit(1);
};

const main = async (): Promise<void> => {
  let env;
  try {
    env = parseEnv(process.env);
  } catch (err) {
    return die(err instanceof ConfigError ? err.message : String(err));
  }

  await requireSecrets('api', envResolver(process.env), die);

  const app = await buildServer({ env });

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      app.log.info({ signal }, 'shutting down');
      void app.close().then(() => process.exit(0));
    });
  }

  await app.listen({ port: env.PORT, host: env.HOST });
};

void main();
