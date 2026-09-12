/**
 * The secret inventory.
 *
 * One declaration per secret, naming which services may read it. This is the only list;
 * `.env.example`, the IAM bindings and the redaction set are all generated from it, so
 * they cannot disagree with each other.
 *
 * Note what is absent: there is no model provider entry. Vertex AI authenticates through
 * the Cloud Run service account's Application Default Credentials, so the model — the
 * thing this application uses most — contributes zero secrets to the inventory.
 */

export type ServiceName = 'api' | 'worker';

export type SecretDeclaration = {
  name: string;
  required: boolean;
  /** Which services may read it. The worker has no business holding the voice key. */
  services: readonly ServiceName[];
  description: string;
  /** Where an operator gets a value, shown verbatim when startup fails. */
  source: string;
};

export const SECRETS = [
  {
    name: 'DATABASE_URL',
    required: true,
    services: ['api', 'worker'],
    description: 'Postgres connection string, including credentials.',
    source: 'Cloud SQL or Neon connection details',
  },
  {
    name: 'REDIS_URL',
    required: true,
    services: ['api', 'worker'],
    description: 'Redis connection string for cache, queue and pub/sub.',
    source: 'Memorystore or Upstash connection details',
  },
  {
    name: 'JWT_SECRET',
    required: true,
    services: ['api'],
    description: 'Signing key for anonymous device tokens.',
    source: 'openssl rand -base64 48',
  },
  {
    name: 'BRAVE_API_KEY',
    required: false,
    services: ['api'],
    description: 'Brave Search, for external recipe discovery. Discovery degrades without it.',
    source: 'Brave Search API dashboard',
  },
  {
    name: 'ELEVENLABS_API_KEY',
    required: false,
    services: ['api'],
    description: 'Voice I/O. Requires convai_write. Voice degrades to text without it.',
    source: 'ElevenLabs dashboard, with convai_write enabled',
  },
  {
    name: 'SPOONACULAR_API_KEY',
    required: false,
    services: ['api'],
    description: 'Optional idea source only. Never persisted to the corpus; 1 hour TTL.',
    source: 'RapidAPI, optional',
  },
  {
    name: 'SENTRY_DSN_SERVER',
    required: false,
    services: ['api', 'worker'],
    description: 'Server-side error reporting. The client DSN is public and lives elsewhere.',
    source: 'Sentry project settings',
  },
] as const satisfies readonly SecretDeclaration[];

export type SecretName = (typeof SECRETS)[number]['name'];

export const secretsFor = (service: ServiceName): readonly SecretDeclaration[] =>
  SECRETS.filter((s) => (s.services as readonly string[]).includes(service));

export const requiredFor = (service: ServiceName): readonly SecretDeclaration[] =>
  secretsFor(service).filter((s) => s.required);

export const findSecret = (name: string): SecretDeclaration | undefined =>
  SECRETS.find((s) => s.name === name);

/**
 * `SENTRY_DSN_CLIENT` is public by design and may ship in the bundle. It is deliberately
 * not in the inventory above — putting it there would teach the scanner to reject a value
 * that is supposed to be public, and the first time that fired someone would loosen the
 * scanner rather than question the entry.
 */
export const PUBLIC_CLIENT_CONFIG = ['VITE_API_URL', 'VITE_SENTRY_DSN_CLIENT'] as const;
