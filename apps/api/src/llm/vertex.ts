import { GoogleGenAI } from '@google/genai';
import type { GenerateRequest, GenerateResult, Generator } from './gateway';

/**
 * Vertex AI.
 *
 * Note what this function does not take: a credential. Vertex authenticates through the
 * Cloud Run service account's Application Default Credentials, so the provider this
 * application leans on hardest is the one that cannot leak a key — because there is no key.
 * Locally, `gcloud auth application-default login` supplies the same thing.
 *
 * `responseJsonSchema` carries the Zod-generated schema straight through, so the model is
 * constrained at generation time by the same definition the response is validated against.
 */
export type VertexOptions = {
  project: string;
  /** Gemini 3.6+ Flash models are served from the global region only. */
  location?: string;
};

/**
 * Retry the two failures that are about load rather than about the request.
 *
 * A pipeline run makes one model call per page, back to back, and a shared Vertex quota
 * answers some of them with 429. Retrying is right there — the request was fine, the
 * service was busy — and the cost of not retrying is a recipe silently missing from
 * someone's week. Everything else (a bad schema, a model that does not exist, no
 * credentials) is thrown on the first attempt, because those do not improve with time.
 */
const RETRIES = 3;
const BACKOFF_MS = [1_000, 3_000, 7_000];

const isRetryable = (error: unknown): boolean => {
  const text = error instanceof Error ? error.message : String(error);
  return /\b(429|503|500)\b|RESOURCE_EXHAUSTED|UNAVAILABLE|deadline|ECONNRESET|socket hang up/i.test(text);
};

const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('aborted'));
      },
      { once: true },
    );
  });

export const createVertexGenerator = (options: VertexOptions): Generator => {
  const clients = new Map<string, GoogleGenAI>();

  const clientFor = (location: string): GoogleGenAI => {
    const existing = clients.get(location);
    if (existing) return existing;
    const client = new GoogleGenAI({
      vertexai: true,
      project: options.project,
      location,
    });
    clients.set(location, client);
    return client;
  };

  return async (req: GenerateRequest): Promise<GenerateResult> => {
    const client = clientFor(req.location || options.location || 'global');

    let lastError: unknown;
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      if (attempt > 0) {
        await sleep(BACKOFF_MS[attempt - 1] ?? 4_000, req.signal);
      }
      try {
        const response = await client.models.generateContent({
          model: req.model,
          contents: [{ role: 'user', parts: [{ text: req.user }] }],
          config: {
            systemInstruction: req.system,
            temperature: req.temperature,
            maxOutputTokens: req.maxOutputTokens,
            responseMimeType: 'application/json',
            responseJsonSchema: req.responseSchema,
            abortSignal: req.signal,
          },
        });

        const usage = response.usageMetadata;
        return {
          text: response.text ?? '',
          tokensIn: usage?.promptTokenCount ?? 0,
          tokensOut: usage?.candidatesTokenCount ?? 0,
        };
      } catch (error) {
        lastError = error;
        if (req.signal.aborted || !isRetryable(error)) throw error;
      }
    }
    throw lastError;
  };
};

/**
 * Vertex needs a project id. Without one there is no provider, and every stage takes its
 * deterministic primary path — which is the position three of the five stages are in by
 * design anyway.
 */
export const vertexGeneratorFrom = (env: Record<string, string | undefined>): Generator | null => {
  const project = env['GOOGLE_CLOUD_PROJECT'];
  if (!project || project.trim().length === 0) return null;
  return createVertexGenerator({
    project: project.trim(),
    location: env['VERTEX_LOCATION'] ?? 'global',
  });
};
