import type { FastifyInstance } from 'fastify';
import { CookRequestSchema, cookRoutes } from '@kitchen/contracts';
import { ApiError } from '../errors';
import type { Gateway } from '../llm/gateway';
import type { BraveProvider } from '../providers/brave';
import type { ElevenLabsProvider } from '../providers/elevenlabs';
import { MAX_AUDIO_BYTES, transcribe } from '../voice/stt';
import { runPipeline } from './run';

/**
 * The two routes that exist because they hold keys.
 *
 * Both are unauthenticated on purpose. A device token proves nothing about who is asking —
 * anyone can mint one — so requiring it here would buy no security and cost the first-run
 * experience a round trip. What actually protects these is the rate limit and the fact
 * that neither writes anything.
 *
 * Both are also slow: the pipeline fetches and reads several pages, and a request that
 * takes ninety seconds is normal rather than broken. The client's timeouts say so.
 */

export type PipelineDeps = {
  gateway: Gateway;
  brave: BraveProvider;
  elevenlabs: ElevenLabsProvider;
};

/** Audio arrives as raw bytes: base64 in a JSON body inflates a recording by a third. */
const AUDIO_TYPES = /^audio\/(webm|mp4|mpeg|ogg|wav|x-m4a|m4a)\b/i;

export const registerPipelineRoutes = (app: FastifyInstance, deps: PipelineDeps): void => {
  app.addContentTypeParser(
    AUDIO_TYPES,
    { parseAs: 'buffer', bodyLimit: MAX_AUDIO_BYTES },
    (_request, body, done) => done(null, body),
  );

  app.post(cookRoutes.transcribe.path, async (request) => {
    const contentType = request.headers['content-type'] ?? '';
    if (!AUDIO_TYPES.test(contentType)) {
      throw new ApiError('invalid_request', 'Send the recording as audio, with its content type.');
    }
    const body = request.body;
    if (!Buffer.isBuffer(body) || body.byteLength === 0) {
      throw new ApiError('invalid_request', 'The recording was empty.');
    }

    const result = await transcribe(deps.elevenlabs, new Uint8Array(body), contentType);
    if (!result.ok) {
      throw new ApiError('dependency_unavailable', capitalise(result.reason));
    }
    return { text: result.text, source: 'elevenlabs' as const };
  });

  app.post(cookRoutes.cook.path, async (request) => {
    const parsed = CookRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw new ApiError('invalid_request', 'That is not a request this route understands.');
    }
    const { wants, pantry, wantRecipes } = parsed.data;
    if (wants.trim().length === 0 && pantry.trim().length === 0) {
      throw new ApiError('invalid_request', 'Answer at least one of the two questions.');
    }

    return runPipeline({
      gateway: deps.gateway,
      brave: deps.brave,
      wantsTranscript: wants,
      pantryTranscript: pantry,
      wantRecipes,
    });
  });
};

const capitalise = (text: string): string =>
  text.length === 0 ? text : `${text[0]!.toUpperCase()}${text.slice(1)}`;
