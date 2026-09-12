import {
  SECRETS,
  findSecret,
  requiredFor,
  secretsFor,
  type SecretDeclaration,
  type ServiceName,
} from './secrets';
import { registerSecretValue } from './redact';

/**
 * Loading secrets.
 *
 * Two rules do most of the work here.
 *
 * The first is that a missing required secret kills the process before the HTTP listener
 * opens. The alternative — discovering it on the first request that needs it — turns a
 * deploy-time mistake into a user-facing one, and buries the cause under whatever the
 * request was trying to do.
 *
 * The second is that `latest` is refused. Secret Manager will happily resolve it, which
 * means adding a secret version silently changes what a running service uses. Pinning
 * makes rotation a deploy you can see, roll back and correlate with an incident.
 */

export type SecretSource = 'secret-manager' | 'env' | 'absent';

export type LoadedSecret = {
  name: string;
  value: string;
  source: SecretSource;
};

export type SecretResolver = (declaration: SecretDeclaration) => Promise<LoadedSecret>;

const LATEST_REFERENCE = /\/versions\/latest\s*$/;

/** `projects/p/secrets/NAME/versions/7` — an explicit version, never an alias to the newest. */
const SECRET_MANAGER_REFERENCE = /^projects\/[^/]+\/secrets\/[^/]+\/versions\/(?!latest\b)[^/]+$/;

export class SecretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretError';
  }
}

/**
 * Cloud Run mounts secrets as environment variables. A value that looks like a Secret
 * Manager *reference* rather than a secret means the deployment asked for a reference
 * rather than the value — usually a copy-paste of the resource path — so we check the
 * pinning rule on it rather than handing a resource path to a provider as a key.
 */
export const checkReference = (name: string, raw: string): void => {
  if (LATEST_REFERENCE.test(raw)) {
    throw new SecretError(
      `${name} resolves "latest". Pin an explicit version instead, so rotation is a deliberate ` +
        `deploy rather than a change that happens to a running service. ` +
        `Use projects/<project>/secrets/${name}/versions/<n>.`,
    );
  }
  if (raw.startsWith('projects/') && !SECRET_MANAGER_REFERENCE.test(raw)) {
    throw new SecretError(
      `${name} looks like a Secret Manager reference but is not a pinned version: "${raw}".`,
    );
  }
};

export const envResolver =
  (env: Record<string, string | undefined>): SecretResolver =>
  async (declaration) => {
    const raw = env[declaration.name];
    if (raw === undefined || raw.trim().length === 0) {
      return { name: declaration.name, value: '', source: 'absent' };
    }
    checkReference(declaration.name, raw);
    return {
      name: declaration.name,
      value: raw.trim(),
      // Cloud Run injects the resolved value under the same name, so the distinction is
      // about where the operator configured it, not about the shape of what arrives.
      source: env['K_SERVICE'] ? 'secret-manager' : 'env',
    };
  };

export type SecretStore = {
  /** Throws for a secret this service did not declare, or one that is absent and required. */
  get: (name: string) => string;
  /** Undefined rather than throwing, for optional secrets. */
  optional: (name: string) => string | undefined;
  has: (name: string) => boolean;
  sourceOf: (name: string) => SecretSource;
};

export type LoadResult = { store: SecretStore; missing: SecretDeclaration[] };

export const loadSecrets = async (
  service: ServiceName,
  resolver: SecretResolver,
): Promise<LoadResult> => {
  const declared = secretsFor(service);
  const loaded = new Map<string, LoadedSecret>();
  for (const declaration of declared) {
    const result = await resolver(declaration);
    loaded.set(declaration.name, result);
    if (result.source !== 'absent') registerSecretValue(result.value);
  }

  const missing = requiredFor(service).filter((d) => loaded.get(d.name)?.source === 'absent');

  const assertDeclared = (name: string): LoadedSecret => {
    const entry = loaded.get(name);
    if (!entry) {
      const known = findSecret(name);
      throw new SecretError(
        known
          ? `${service} read ${name}, which it does not declare. Add ${service} to its ` +
            `services list in the inventory, or stop reading it here.`
          : `${name} is not in the secret inventory. Declare it in apps/api/src/config/secrets.ts.`,
      );
    }
    return entry;
  };

  const store: SecretStore = {
    get: (name) => {
      const entry = assertDeclared(name);
      if (entry.source === 'absent') {
        throw new SecretError(`${name} is required by ${service} but was not provided.`);
      }
      return entry.value;
    },
    optional: (name) => {
      const entry = assertDeclared(name);
      return entry.source === 'absent' ? undefined : entry.value;
    },
    has: (name) => loaded.get(name)?.source !== undefined && loaded.get(name)?.source !== 'absent',
    sourceOf: (name) => assertDeclared(name).source,
  };

  return { store, missing };
};

/** The message an operator sees when a deploy is missing something. */
export const describeMissing = (service: ServiceName, missing: SecretDeclaration[]): string =>
  [
    `${service} cannot start: ${missing.length} required secret${missing.length === 1 ? '' : 's'} missing.`,
    '',
    ...missing.flatMap((d) => [
      `  ${d.name}`,
      `    ${d.description}`,
      `    Get it from: ${d.source}`,
      `    Provide it via Secret Manager (pinned version) in Cloud Run, or .env locally.`,
      '',
    ]),
    'See .env.example for the full list of names.',
  ].join('\n');

/**
 * Start-up gate. Exits rather than listening, so a misconfigured deploy fails at deploy
 * time rather than in front of a user mid-session.
 */
export type RequireSecretsOptions = {
  /**
   * Secrets that may be absent, with the feature that goes away when they are.
   *
   * A deployment that only serves the cooking pipeline needs three provider credentials
   * and no storage at all, and refusing to start without a database it will never open a
   * connection to is a deploy that fails for a reason that is not true. So the caller says
   * which absences it can survive, and gets told what it lost — rather than every absence
   * being fatal, or none of them being.
   */
  degradable?: Partial<Record<string, string>>;
  /** Where the warnings go. */
  onDegraded?: (message: string) => void;
};

export const requireSecrets = async (
  service: ServiceName,
  resolver: SecretResolver,
  onFatal: (message: string) => never,
  options: RequireSecretsOptions = {},
): Promise<SecretStore> => {
  const { store, missing } = await loadSecrets(service, resolver);
  const degradable = options.degradable ?? {};

  const fatal = missing.filter((s) => degradable[s.name] === undefined);
  if (fatal.length > 0) onFatal(describeMissing(service, fatal));

  for (const secret of missing) {
    const consequence = degradable[secret.name];
    if (consequence) options.onDegraded?.(`${secret.name} is not set: ${consequence}`);
  }
  return store;
};

export const inventoryNames = (): string[] => SECRETS.map((s) => s.name);
