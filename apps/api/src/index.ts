import process from 'node:process';
import { buildServer } from './server';
import { ConfigError, parseEnv } from './config/env';
import { envResolver, requireSecrets } from './config/loader';
import { createDb, databaseCheck } from './db/client';
import { createGateway } from './llm/gateway';
import { vertexGeneratorFrom } from './llm/vertex';
import { createBraveProvider } from './providers/brave';
import { createElevenLabsProvider } from './providers/elevenlabs';

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

  /*
   * Storage is degradable; the providers are not.
   *
   * The cooking pipeline needs no database and no queue — it reads pages and calls a model
   * — so a deployment that serves only that should start, serve it, and say plainly which
   * features are missing. What must never be silent is the reverse: a database that is
   * configured and broken still fails readiness, as it always did.
   */
  const warn = (message: string): void => {
    process.stderr.write(`${message}\n`);
  };
  const secrets = await requireSecrets('api', envResolver(process.env), die, {
    degradable: {
      DATABASE_URL: 'sessions, devices and the shared cooking flow are off; the pipeline still runs',
      REDIS_URL: 'background ingestion is off; nothing the pipeline does needs a queue',
    },
    onDegraded: warn,
  });

  // Opening the pool does not connect; readiness is what discovers a broken database, and
  // it reports rather than crashing, so a Postgres blip does not restart a healthy process.
  const databaseUrl = secrets.optional('DATABASE_URL');
  const database = databaseUrl ? createDb(databaseUrl) : null;

  /*
   * The pipeline's providers.
   *
   * Each is optional and each says why when it is missing, because a deploy without a
   * Brave key should still serve the scheduler rather than fail to start. What is not
   * optional is where the keys live: this process, and never the browser.
   */
  const generate = vertexGeneratorFrom(process.env);
  const pipeline = {
    gateway: createGateway({
      generate,
      /*
       * Longer than the 30s default, because this budget covers the retries too.
       *
       * The generator backs off and retries a 429, and with a 30s cap the first slow
       * attempt used the whole budget and the retry never happened — which showed up as
       * "model did not respond within 30s" against pages that would have been read fine
       * on a second ask. The run's own deadline is what bounds the total.
       */
      timeoutMs: 45_000,
      // Without a database the stage cache is simply not there. It saves money; it is not
      // load-bearing.
      ...(database ? { db: database.db } : {}),
      env: process.env,
    }),
    brave: createBraveProvider(secrets),
    elevenlabs: createElevenLabsProvider(secrets),
  };
  for (const [name, provider] of [
    ['search', pipeline.brave],
    ['voice', pipeline.elevenlabs],
  ] as const) {
    if (!provider.available) warn(`${name}: ${provider.reason}`);
  }
  if (!generate) warn('generation: GOOGLE_CLOUD_PROJECT is not set; every stage takes its floor');

  const app = await buildServer({
    env,
    dependencies: database ? [databaseCheck(database)] : [],
    pipeline,
    // Without these the identity routes silently do not exist. They were exercised through
    // the test harness, which passes them, and not through this path -- so the gap only
    // showed up on the first real boot.
    ...(database ? { db: database.db } : {}),
    ...(secrets.optional('JWT_SECRET') ? { jwtSecret: secrets.get('JWT_SECRET') } : {}),
  });

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      app.log.info({ signal }, 'shutting down');
      void app
        .close()
        .then(() => database?.close())
        .then(() => process.exit(0));
    });
  }

  await app.listen({ port: env.PORT, host: env.HOST });
};

void main();
