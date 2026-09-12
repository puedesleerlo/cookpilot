/**
 * Redaction.
 *
 * Two mechanisms, because either alone leaks. Shape matching catches a key that reaches a
 * log under a field nobody thought to protect — which is how it usually happens, since the
 * field you remembered to redact was never the problem. Value matching catches a secret
 * whose shape we do not know, because the loader registered the actual value at startup.
 *
 * Redaction happens at the logger rather than at each call site, so "remember to redact"
 * is not a rule anyone has to keep.
 */

export const SECRET_SHAPES: readonly { name: string; re: RegExp }[] = [
  { name: 'anthropic-key', re: /sk-ant-[A-Za-z0-9_-]{16,}/g },
  { name: 'google-api-key', re: /AIza[0-9A-Za-z_-]{35}/g },
  { name: 'elevenlabs-key', re: /\bsk_[0-9a-f]{32,}\b/g },
  { name: 'brave-key', re: /\bBS[A-Za-z0-9_-]{20,}\b/g },
  { name: 'bearer-token', re: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/gi },
  { name: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { name: 'db-url-credentials', re: /\b(postgres(?:ql)?|redis(?:s)?|mongodb(?:\+srv)?):\/\/[^\s:@/]+:[^\s@/]+@/g },
  { name: 'pem-private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { name: 'service-account', re: /"type"\s*:\s*"service_account"/g },
];

export const REDACTION = '[redacted]';

/** Values registered by the loader at startup. Matched literally, whatever their shape. */
const knownValues = new Set<string>();

export const registerSecretValue = (value: string): void => {
  // Very short values would redact ordinary text; a real credential is never 8 characters.
  if (value.trim().length >= 8) knownValues.add(value.trim());
};

export const clearRegisteredSecrets = (): void => knownValues.clear();

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const redact = (input: string): string => {
  let out = input;
  for (const value of knownValues) {
    out = out.replace(new RegExp(escapeRe(value), 'g'), REDACTION);
  }
  for (const { re } of SECRET_SHAPES) {
    out = out.replace(new RegExp(re.source, re.flags), (match) =>
      // Keep a credentialled URL readable up to the credentials, so an operator can still
      // see which host failed without seeing the password.
      /:\/\//.test(match) ? match.replace(/:\/\/[^\s@/]+:[^\s@/]+@/, `://${REDACTION}@`) : REDACTION,
    );
  }
  return out;
};

/**
 * Walk any structure and redact strings inside it. Depth-limited so a cyclic or
 * pathological object cannot stall the logger.
 */
export const redactDeep = (value: unknown, depth = 0): unknown => {
  if (depth > 8) return '[depth-limited]';
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1));
  if (value instanceof Error) {
    return { name: value.name, message: redact(value.message), stack: redact(value.stack ?? '') };
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redactDeep(v, depth + 1)]),
    );
  }
  return value;
};
