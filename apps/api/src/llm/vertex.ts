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
