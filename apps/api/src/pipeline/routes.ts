import type { FastifyInstance } from 'fastify';
import { CookRequestSchema, cookRoutes, type CookProgress } from '@kitchen/contracts';
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

  app.post(cookRoutes.cook.path, async (request, reply) => {
    const parsed = CookRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw new ApiError('invalid_request', 'That is not a request this route understands.');
    }
    const { wants, pantry, wantRecipes } = parsed.data;
    if (wants.trim().length === 0 && pantry.trim().length === 0) {
      throw new ApiError('invalid_request', 'Answer at least one of the two questions.');
    }

    const run = (onProgress?: (event: CookProgress) => void) =>
      runPipeline({
        gateway: deps.gateway,
        brave: deps.brave,
        wantsTranscript: wants,
        pantryTranscript: pantry,
        wantRecipes,
        // Inside Cloud Run's 300s request timeout and the client's 180s, so the answer is
        // always what was found rather than a timeout on either side.
        deadlineMs: 120_000,
        ...(onProgress ? { onProgress } : {}),
      });

    // A client that did not ask for the commentary gets the plain JSON it always got.
    if (!wantsStream(request.headers.accept)) return run();

    /*
     * Server-sent events, for a client that wants to watch.
     *
     * The chain takes the better part of a minute, and a minute of spinner reads as broken.
     * Streaming is the honest fix: what the screen shows is what the pipeline is actually
     * doing, at the moment it does it, rather than an animation timed to look plausible.
     *
     * `X-Accel-Buffering: no` matters in front of a proxy that would otherwise hold the
     * whole response until it completes, which turns a live log back into a long wait.
     */
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (event: string, data: unknown): void => {
      if (reply.raw.writableEnded) return;
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    /*
     * The client going away mid-run is ordinary; stop writing into a closed socket.
     *
     * Watch the *response*, not the request. `request.raw` emits `close` when the request
     * body has finished being read — which for a POST is immediately — so listening there
     * suppressed every progress event before the first one was sent, and the stream
     * delivered nothing but the final result.
     */
    let gone = false;
    reply.raw.on('close', () => {
      gone = true;
    });

    try {
      const result = await run((event) => {
        if (!gone) send('progress', event);
      });
      send('result', result);
    } catch (error) {
      send('progress', {
        kind: 'failed',
        reason: error instanceof Error ? error.message : 'Something went wrong.',
      } satisfies CookProgress);
    } finally {
      if (!reply.raw.writableEnded) reply.raw.end();
    }
    return reply;
  });
};

const wantsStream = (accept: string | undefined): boolean =>
  typeof accept === 'string' && accept.includes('text/event-stream');

const capitalise = (text: string): string =>
  text.length === 0 ? text : `${text[0]!.toUpperCase()}${text.slice(1)}`;
