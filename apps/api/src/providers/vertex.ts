import type { SecretStore } from '../config/loader';

/**
 * Vertex AI — the model provider.
 *
 * This module reads no credential, and that is the point worth noticing. Vertex
 * authenticates through the Cloud Run service account's Application Default Credentials,
 * so the thing this application leans on hardest is the one provider that cannot leak a
 * key: there is no key.
 *
 * The client itself lands in `add-gemini-gateway`.
 */
export type VertexConfig = {
  projectId: string;
  /** Gemini 3.6+ Flash models run in the global region only. */
  location: string;
};

export const vertexConfig = (env: Record<string, string | undefined>): VertexConfig => ({
  projectId: env['GOOGLE_CLOUD_PROJECT'] ?? '',
  location: env['VERTEX_LOCATION'] ?? 'global',
});

/** Present so the shape matches the other providers; deliberately ignores the store. */
export const createVertexProvider = (_store: SecretStore, env: Record<string, string | undefined>) => ({
  kind: 'vertex' as const,
  config: vertexConfig(env),
  usesSecret: null,
});
